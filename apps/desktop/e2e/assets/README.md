# Синтетический аудиофайл

`tone.mp3` используется в E2E из математического синуса 440 Гц, длительность 2 секунды. Записей людей, скачанной музыки и внешних media нет. Fixture свободно используется как часть этого репозитория.

Команда генерации (FFmpeg с `libmp3lame`):

```sh
ffmpeg -hide_banner -loglevel error -f lavfi -i 'sine=frequency=440:duration=2' -codec:a libmp3lame -b:a 192k -map_metadata -1 tone.mp3
```

Генерация не выполняется при тесте. Закреплённый файл проходит настоящий metadata writer и validation приложения; FFmpeg для данного MP3-сценария не требуется.
