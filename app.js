const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const logger = require('morgan');
const compression = require('compression');
const cors = require("cors");

const todoRouter = require('./routes/todo');
const indexRouter = require('./routes/index');
const usersRouter = require('./routes/users');
const scriptRouter = require('./routes/scriptEditor');

const {
  sequelize
} = require("./models");
const timeout = require('connect-timeout')

const app = express();

// app.use(cors());

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');

// view engine setup
app.use(express.static(__dirname + "/public"));
app.use(bodyParser.urlencoded({extended: false}));

// sequelize.sync( {force: false} )
//   .then(() => {
//     console.log('데이터베이스 연결됨.');
//   }).catch((err) => {
//     console.error(err);
//   });

// app.use(timeout('5s'));
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({
  extended: false
}));
app.use(cookieParser());

app.use(cors());

// app.use("*", todoRouter);
app.use('/', indexRouter);
app.use('/users', usersRouter);
app.use("/scriptEditor", scriptRouter);

module.exports = app;
