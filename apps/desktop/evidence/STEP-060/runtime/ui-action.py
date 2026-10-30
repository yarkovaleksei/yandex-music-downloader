# STEP-060: ввод X11 и снимки настоящего shipping UI, без DevTools и подмены ASAR.
from pathlib import Path
import sys,subprocess,time,json,datetime
container,kind,filename=sys.argv[1:4];args=sys.argv[4:]
root=Path('/home/user/github.com/yarkovaleksei/yandex-music-downloader');report=root/'.cache/desktop-packaging/step060-ui-update'
if kind=='click':command=['xdotool','mousemove',*args,'click','1']
elif kind=='keys':command=['xdotool','key','--clearmodifiers',*args]
elif kind=='type':command=['xdotool','type','--clearmodifiers','--',*args]
elif kind=='shot':command=None
else:raise ValueError('Неверное действие')
if command:subprocess.run(['docker','exec',container,*command],check=True)
time.sleep(0.8)
subprocess.run(['docker','exec',container,'scrot','/report/ui/'+filename],check=True)
p=report/'ui-actions.json';events=json.loads(p.read_text()) if p.exists() else []
events.append({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'container':container,'action':kind,'arguments':args,'screenshot':'ui/'+filename})
p.write_text(json.dumps(events,ensure_ascii=False,indent=2)+'\n')
print(filename)
