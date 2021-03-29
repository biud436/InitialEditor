FROM node:12
EXPOSE 9006
WORKDIR /usr/src/initial-editor
COPY package*.json ./
RUN npm install
COPY . .
COPY ./nginx/default.conf /etc/nginx/conf.d/default.conf
CMD ["node", "./bin/www"]

