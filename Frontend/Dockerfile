FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html app.js style.css /usr/share/nginx/html/
COPY Images /usr/share/nginx/html/Images
EXPOSE 80