import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material';

/** Выход требует подтверждения: случайный клик не удаляет сохранённый вход. */
export function LogoutDialog({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      aria-labelledby="logout-title"
      aria-describedby="logout-description"
    >
      <DialogTitle id="logout-title">Выйти из аккаунта?</DialogTitle>
      <DialogContent>
        <DialogContentText id="logout-description">
          Сохранённый вход будет удалён. Чтобы снова загружать музыку, нужно
          будет войти через браузер.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Отмена</Button>
        <Button color="error" onClick={onConfirm}>
          Выйти
        </Button>
      </DialogActions>
    </Dialog>
  );
}
