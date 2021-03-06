var BPromise = require('bluebird');
var parse = require('pg-connection-string').parse;
var pg = require('pg');
var Client = pg.Client;

var errors = {
  '42P04': {
    name: 'duplicate_database',
    message: 'Attempted to create a duplicate database.'
  },
  '3D000': {
    name: 'invalid_catalog_name',
    message: 'Attempted to drop a database that does not exist.'
  },
  '23505': {
    name: 'unique_violation',
    message: 'Attempted to create a database concurrently.'
  }
};

function PgError(pgErr) {
  var message = (errors[pgErr.code].message || 'Unknown Postgres error.') + ' Cause: ' + pgErr.message;
  var error = Error.call(this, message);
  this.message = error.message;

  this.name = errors[pgErr.code].name || 'PgError';

  this.stack = error.stack;
  this.pgErr = pgErr;
}
PgError.prototype = Object.create(Error.prototype);

function createOrDropDatabase(action) {
  action = action.toUpperCase();
  return function (opts, dbName, cb) {
    var config
    if (typeof opts === 'string') {
      config = parse(opts);
      config.database = 'postgres';
    } else {
      if (!opts.database) {
        opts.database = 'postgres';
      }
      config = opts;
    }
    return new BPromise(function (resolve, reject) {
      var client = new Client(config);
      //disconnect client when all queries are finished
      client.on('drain', client.end.bind(client));
      client.on('error', function (err) {
        reject(err);
      });
      client.connect();

      var escapedDbName = dbName.replace(/\"/g, '""');
      var sql = action + ' DATABASE "' + escapedDbName + '"';
      if (config.template) sql += ' WITH TEMPLATE=' + config.template;
      client.query(sql, function (pgErr, res) {
        var err;
        if (pgErr) {
          err = new PgError(pgErr);
          reject(err);
          return
        }
        resolve(res);
      });
    }).nodeify(cb);
  };
};

module.exports = {
  createdb: createOrDropDatabase('create'),
  dropdb: createOrDropDatabase('drop')
};
