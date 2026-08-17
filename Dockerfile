# FLOOR Studio — static app behind nginx.
#   docker build -t floorstudio . && docker run -d -p 8080:80 floorstudio
# Configure cloud mode (optional) by editing config.js before building,
# or mount your own: -v $PWD/config.js:/usr/share/nginx/html/config.js:ro
FROM nginx:alpine
COPY index.html manifest.json service-worker.js supabase-adapter.js config.js styles.css /usr/share/nginx/html/
COPY js /usr/share/nginx/html/js
COPY icons /usr/share/nginx/html/icons
