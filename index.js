const Swagger = require('swagger-client');
const jamendoApiSpec = require('./test/openapi/jamendo.json');

Swagger({spec: jamendoApiSpec})
  .then( client => {
      console.log(client.spec); // The resolved spec
      console.log(client.originalSpec); // In case you need it
      console.log(client.errors); // Any resolver errors

      // Tags interface
      //client.apis.pet.addPet({id: 1, name: "bobby"}).then(...)

      // TryItOut Executor, with the `spec` already provided
      // client.execute({operationId: 'addPet', parameters: {id: 1, name: "bobby") }).then(...)
   });
