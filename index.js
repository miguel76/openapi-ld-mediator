const fs = require('fs');
const Swagger = require('swagger-client');
const jsonld = require('jsonld');
const Promise = require('promise');
const _ = require('lodash');
const async = require('async');
const rdflib = require('rdflib');
const eye = require('./eye.js');

const readJson = fileName => cb =>
  fs.readFile(fileName, 'utf8', (err, str) => err ? cb(err) : cb(null, JSON.parse(str)));

const selectAs = (inPath, outPath) => (value, obj, cb) => {
  if (!cb) {
    cb = obj;
    obj = {};
  };
  var input = inPath ? _.get(value, inPath) : value;
  return cb(null, outPath ? _.set(obj, outPath, input) : input);
};

const invokation = path => (obj, ...args) => _.invoke(obj, path, ...args);

const dePromisify = promiseReturningFunction => (...params) => {
    var cb = params.pop();
    _.spread(promiseReturningFunction)(params)
        .then(result => cb(null, result))
        .catch(error => cb(error));
};

const classicTurtle = turtleString => {
  return turtleString.replace(/^PREFIX ([^:]*): (<[^>]*>)$/mg, '@prefix $1: $2.')
};

const quadsToTriples = quads => {
  return quads.replace(/^(\S*) (\S*) (\S*) (\S*) .$/mg, '$1 $2 $3 .')
};

const fromJsonLdToTurtle = (input, callback) => {
  async.autoInject({
    newStore: [async.asyncify(rdflib.graph)],
    quads: [_.partial(jsonld.toRDF, input, {format: 'application/nquads'})],
    rdfInStore: ['quads', 'newStore', _.partial(rdflib.parse, _, _, null, 'application/n-quads')],
    n3: ['rdfInStore', _.partial(rdflib.serialize, null, _, 'http://shouldbethebase.org/', 'text/n3')],
  }, (err, result) => err ? callback(err) : callback(null, result.n3));
};

var rdfLibStore = rdflib.graph();

async.autoInject({
  jamendoOntology: [_.partial(fs.readFile, './test/ontologies/jamendo.ttl', 'utf8')],
  identityQuery: [_.partial(fs.readFile, './queries/identity.n3', 'utf8')],
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
  resultsAsN3: ['jamendoSearchResultsLd', fromJsonLdToTurtle],
  eyeDataArray: [
    'resultsAsN3', 'jamendoOntology',
    _.partial(
      async.asyncify(_.concat),
      [ 'http://eulersharp.sourceforge.net/2003/03swap/rdfs-domain.n3',
        'http://eulersharp.sourceforge.net/2003/03swap/rdfs-range.n3'])],
  resultsAfterInference: ['eyeDataArray', 'identityQuery', eye],
  resultsAfterInferenceForStore: ['resultsAfterInference', async.asyncify(classicTurtle)],
  newOutputStore: [async.asyncify(rdflib.graph)],
  fullOutputStore: ['resultsAfterInferenceForStore', 'newOutputStore', _.partial(rdflib.parse, _, _, 'http://shouldbethebase.org/', 'text/n3')],
  outputAsQuads: ['fullOutputStore', _.partial(rdflib.serialize, null, _, 'http://shouldbethebase.org/', 'application/n-quads')],
  outputAsTriples: ['outputAsQuads', async.asyncify(quadsToTriples)],
  outputAsJsonLd: ['outputAsTriples', _.partial(jsonld.fromRDF, _, {format: 'application/nquads'})],
  output: ['outputAsJsonLd', 'jamendoJsonLdFrame', _.partial(jsonld.frame, _, _, {})],
  result: ['output', async.asyncify(_.identity)]
}, function(err, results) {
  if (err) {
    console.error(err);
  }
  // console.log(results);
  console.log(results.result);
});
