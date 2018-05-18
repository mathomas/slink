'use strict';

const axios = require('axios');

const url = 'http://checkip.amazonaws.com/';

module.exports.handler = async (event, context, callback) => {
  let response;

  try {
    const ret = await axios(url);
    response = {
      statusCode: 200,
      body: JSON.stringify({
        message: 'hello world',
        location: ret.data.trim()
      })
    };
  }
  catch (err) {
    console.log(err);
    callback(err, null);
  }

  callback(null, response);
};