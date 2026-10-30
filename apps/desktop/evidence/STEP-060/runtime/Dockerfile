FROM yandex-downloader-step035-smoke
USER root
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends xdotool scrot xdg-utils python3 && rm -rf /var/lib/apt/lists/*
USER 1000:1000
ENV MUSIC_DOWNLOADER_SMOKE_DIR="" DISPLAY=:99
