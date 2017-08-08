const request = require('request');
const eyeServiceUrl = 'http://eye.restdesc.org/';

module.exports = (n3Data, n3Query, callback) => {
  request.post(
      {url: eyeServiceUrl, form: {data: n3Data, query: n3Query}},
      function(err, httpResponse, body) {
        if (err) {
          callback(err);
        } else {
          callback(null, body);
        }
      })
}
