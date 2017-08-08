const fs = require('fs');
const Swagger = require('swagger-client');
const jsonld = require('jsonld');
const Promise = require('promise');
const _ = require('lodash');
const async = require('async');

const readJson = fileName => cb =>
  fs.readFile(fileName, 'utf8', (err, str) => err ? cb(err) : cb(null, JSON.parse(str)));

const selectAs = (inPath, outPath) => (value, obj, cb) => {
  if (!cb) {
    cb = obj;
    obj = {};
  };
  var input = inPath ? _.get(value, inPath) : value;
  return cb(null, outPath ? _.set(obj, outPath, input) : input);
}
const invokation = path => (obj, ...args) => _.invoke(obj, path, ...args);
const dePromisify = promiseReturningFunction => (...params) => {
    var cb = params.pop();
    _.spread(promiseReturningFunction)(params)
        .then(result => cb(null, result))
        .catch(error => cb(error));
};

async.autoInject({
  jamendoApiSpec: readJson('./test/openapi/jamendo.json'),
  jamendoJsonLdContexts: readJson('./test/jsonld-contexts/jamendo-searchTracks-response.jsonld'),
  jamendoJsonLdFrame: readJson('./test/jsonld-frames/jamendo-searchTracks-results.jsonld'),
  jamendoSwaggerConf: ['jamendoApiSpec', selectAs(null, 'spec')],
  jamendoApi: ['jamendoSwaggerConf', dePromisify(Swagger)],
  jamendoSearchCall: [async.constant({
    securities:
        process.env.JAMENDO_CLIENT_ID ?
            {authorized: {apikey_auth: process.env.JAMENDO_CLIENT_ID}} : {},
    operationId: 'searchTracks',
    parameters: {search: "punk"}
  })],
  jamendoApiSpecAndSearchCall: ['jamendoApiSpec', 'jamendoSearchCall', selectAs(null, 'spec')],
  jamendoFullRequest: ['jamendoApiSpecAndSearchCall', async.asyncify(Swagger.buildRequest)],
  jamendoSearchExecuted: ['jamendoApi', 'jamendoSearchCall', dePromisify(invokation('execute'))],
  jamendoSearchResults: ['jamendoSearchExecuted', selectAs('body')],
  jamendoSearchResultsLd: (jamendoSearchResults, jamendoJsonLdContexts, cb) => {
    async.seq(
        _.partial(async.map,
            jamendoJsonLdContexts,
            async.seq(
                selectAs(null, 'expandContext'),
                _.partial(jsonld.expand, jamendoSearchResults))),
        async.asyncify(_.flatten),
        async.asyncify(_.spread(_.partial(_.merge, {}))))(cb);
  },
  resultsLd: ['jamendoSearchResultsLd', 'jamendoJsonLdFrame', _.partial(jsonld.frame, _, _, {})],
  result: ['resultsLd', async.asyncify(_.identity)]
}, function(err, results) {
  if (err) {
    console.error(err);
  }
  console.log(results.result);
});
