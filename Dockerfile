FROM nginx:stable-alpine
COPY ./nginx/default.conf /etc/nginx/conf.d/default.conf
COPY ./dist /usr/share/nginx/html/dist
COPY ./css /usr/share/nginx/html/css
COPY ./images /usr/share/nginx/html/images
COPY ./index.html /usr/share/nginx/html/index.html

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]