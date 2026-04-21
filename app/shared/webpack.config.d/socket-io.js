// Per socket.io bundler docs: setting node=false prevents webpack from
// processing Node.js-style dynamic requires inside socket.io-client,
// which eliminates the "Critical dependency" error.
config.node = false;
