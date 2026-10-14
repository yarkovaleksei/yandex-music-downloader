# Штатный Ctrl+C отправляется в отдельную консоль дочернего CLI.
# child.kill('SIGINT') на Windows даёт аварийное завершение вместо paused.
# @link https://learn.microsoft.com/en-us/windows/console/generateconsolectrlevent
$ErrorActionPreference = 'Stop'
try {
    # Node пишет JSON в UTF-8: CP866/1251 не должны портить пути с кириллицей.
    [Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
    $request = [Console]::ReadLine() | ConvertFrom-Json
    Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Text;
using System.Threading;
using System.Runtime.InteropServices;
public static class AcceptanceConsole {
    [StructLayout(LayoutKind.Sequential)] struct SA { public int size; public IntPtr descriptor; public int inherit; }
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct SI {
        public int cb; public string reserved; public string desktop; public string title;
        public int x,y,xSize,ySize,xChars,yChars,fill,flags; public short show,reservedSize;
        public IntPtr reservedBytes,input,output,error;
    }
    [StructLayout(LayoutKind.Sequential)] struct PI { public IntPtr process,thread; public uint pid,tid; }
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool CreatePipe(out IntPtr read,out IntPtr write,ref SA security,int size);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetHandleInformation(IntPtr handle,uint mask,uint flags);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool CreateProcessW(string app,StringBuilder command,IntPtr ps,IntPtr ts,bool inherit,uint flags,IntPtr env,string cwd,ref SI si,out PI pi);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr handle,uint timeout);
    [DllImport("kernel32.dll")] static extern bool GetExitCodeProcess(IntPtr process,out uint code);
    [DllImport("kernel32.dll")] static extern bool TerminateProcess(IntPtr process,uint code);
    [DllImport("kernel32.dll")] static extern bool FreeConsole();
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool AttachConsole(uint pid);
    [DllImport("kernel32.dll")] static extern bool SetConsoleCtrlHandler(IntPtr handler,bool add);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool GenerateConsoleCtrlEvent(uint ev,uint group);

    // Quoting соответствует argv Windows: завершающие backslash удваиваются перед quote.
    public static string Quote(string value) {
        StringBuilder result=new StringBuilder("\""); int slashes=0;
        foreach(char c in value) {
            if(c=='\\') { slashes++; continue; }
            if(c=='"') { result.Append('\\',slashes*2+1); result.Append(c); }
            else { result.Append('\\',slashes); result.Append(c); }
            slashes=0;
        }
        result.Append('\\',slashes*2); result.Append('"'); return result.ToString();
    }
    static Thread Forward(IntPtr handle,Stream target) {
        Thread thread=new Thread(delegate() {
            using(FileStream source=new FileStream(new Microsoft.Win32.SafeHandles.SafeFileHandle(handle,true),FileAccess.Read)) {
                byte[] buffer=new byte[65536]; int length;
                while((length=source.Read(buffer,0,buffer.Length))>0) { target.Write(buffer,0,length); target.Flush(); }
            }
        });
        thread.IsBackground=true; thread.Start(); return thread;
    }
    public static int Run(string executable,string cwd,string[] args) {
        SA sa=new SA(); sa.size=Marshal.SizeOf(typeof(SA)); sa.inherit=1;
        IntPtr outRead,outWrite,errRead,errWrite,inRead,inWrite;
        if(!CreatePipe(out outRead,out outWrite,ref sa,0) || !CreatePipe(out errRead,out errWrite,ref sa,0) || !CreatePipe(out inRead,out inWrite,ref sa,0)) return 90;
        SetHandleInformation(outRead,1,0); SetHandleInformation(errRead,1,0); SetHandleInformation(inWrite,1,0);
        SI si=new SI(); si.cb=Marshal.SizeOf(typeof(SI)); si.flags=0x101; si.show=0;
        si.input=inRead; si.output=outWrite; si.error=errWrite;
        StringBuilder command=new StringBuilder(Quote(executable));
        foreach(string arg in args) command.Append(" ").Append(Quote(arg));
        PI pi;
        // CREATE_NEW_CONSOLE изолирует Ctrl+C от терминала коллеги и управляющего Node.
        if(!CreateProcessW(executable,command,IntPtr.Zero,IntPtr.Zero,true,0x10,IntPtr.Zero,cwd,ref si,out pi)) return 91;
        CloseHandle(outWrite); CloseHandle(errWrite); CloseHandle(inRead); CloseHandle(inWrite); CloseHandle(pi.thread);
        Stream stdout=Console.OpenStandardOutput(), stderr=Console.OpenStandardError();
        Thread output=Forward(outRead,stdout), error=Forward(errRead,stderr);
        // Дочерний Node может завершиться сразу после Ctrl+C, раньше фонового control.
        // Основной поток ждёт запись подтверждения: exit 4 сам по себе её не заменяет.
        ManualResetEvent pauseDone=new ManualResetEvent(true);
        Thread control=new Thread(delegate() {
            try {
                string line;
                while((line=Console.ReadLine())!=null) {
                    if(line=="pause") {
                        pauseDone.Reset();
                        try {
                            FreeConsole();
                            bool sent=AttachConsole(pi.pid) && SetConsoleCtrlHandler(IntPtr.Zero,true) && GenerateConsoleCtrlEvent(0,0);
                            Thread.Sleep(250); FreeConsole();
                            byte[] note=Encoding.UTF8.GetBytes(sent?"CTRL_C_SENT\n":"CTRL_C_FAILED\n");
                            lock(stderr) { stderr.Write(note,0,note.Length); stderr.Flush(); }
                        } finally { pauseDone.Set(); }
                    } else if(line=="stop") { TerminateProcess(pi.process,92); break; }
                }
                // EOF управляющего процесса не оставляет загрузку бесконечно в фоне.
                if(WaitForSingleObject(pi.process,0)==258) TerminateProcess(pi.process,93);
            } catch { TerminateProcess(pi.process,94); }
        });
        control.IsBackground=true; control.Start();
        if(WaitForSingleObject(pi.process,3600000)==258) TerminateProcess(pi.process,95);
        WaitForSingleObject(pi.process,10000);
        bool acknowledged=pauseDone.WaitOne(10000);
        output.Join(10000); error.Join(10000);
        uint code; GetExitCodeProcess(pi.process,out code); CloseHandle(pi.process);
        return acknowledged?(int)code:97;
    }
}
'@
    $exitCode = [AcceptanceConsole]::Run([string]$request.executable, [string]$request.cwd, [string[]]$request.args)
    [Environment]::Exit($exitCode)
} catch {
    # Native exception/argv не сохраняются и не выводятся в итоговый отчёт.
    [Console]::Error.WriteLine('WINDOWS_CONTROLLER_FAILED')
    [Environment]::Exit(96)
}
