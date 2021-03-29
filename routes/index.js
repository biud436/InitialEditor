const express = require('express');
const router = express.Router();
const cors = require('cors');
// const {startServer} = require('snowpack');
// const server = await startServer();

/* GET home page. */
router.get('/', cors(), async (req, res, next) => {
  // const buildResult = await server.loadUrl(req.url);
  res.render('index', { title: 'Initial Editor' });
  // res.send(buildResult.contents);
});

module.exports = router;
