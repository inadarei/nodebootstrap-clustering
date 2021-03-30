var cluster = require('cluster')
    , each  = require('lodash.foreach')
    , log   = require('metalogger')();

exports = module.exports;

exports.setup = function() {
  log.notice("Starting app in clustered mode");

  var numCPUs  = require('os').cpus().length;
  var timeouts = [];

  for (var i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('fork', function forkingWorker(worker) {
    log.debug('Forking worker #' + worker.id);
    timeouts[worker.id] = setTimeout(function workerTimingOut() {
      log.error(['Worker taking too long to start']);
    }, 2000);
  });

  cluster.on('listening', function onClusterListening(worker, address) {
    // from cluster doc
    var type_normalize = {
      '-1':   'unix domain socket',
      '4':    'TCPv4',
      '6':    'TCPv6',
      'udp4': 'UDPv4',
      'udp6': 'UDPv6'
    };

    log.notice('Worker #' + worker.id + ' listening on port: ' + address.port + ' ' + type_normalize[address.addressType]);
    clearTimeout(timeouts[worker.id]);
  });

  cluster.on('online', function onClusterOnline(worker) {
    log.debug('Worker #'+worker.id+' is online');
  });

  cluster.on('exit', function onClusterExit(worker, code, signal) {
    log.error(['The worker #'+worker.id+' has exited with exitCode ' + worker.process.exitCode]);
    clearTimeout(timeouts[worker.id]);
    // Don't try to restart the workers when disconnect or destroy has been called
    if(worker.suicide !== true) {
      log.warning('Worker #' + worker.id + ' did not commit suicide, restarting');
      cluster.fork();
    }
  });

  cluster.on('disconnect', function onClusterDisconnect(worker) {
    log.warning('The worker #' + worker.id + ' has disconnected');
  });

  // Trick suggested by Ian Young (https://github.com/isaacs/node-supervisor/issues/40#issuecomment-4330946)
  // to make cluster and supervisor play nicely together:
  if (process.env.NODE_HOT_RELOAD == 1) {
    var signals = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
    each(signals, function forEachQuitSignal(signal){
      process.on(signal, function onQuitSignals(){
        each(cluster.workers, function destroyWorker(worker){
          worker.destroy();
        });
      });
    });
  }
};
