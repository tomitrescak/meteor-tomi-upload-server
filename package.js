Package.describe({
  name: 'tomi:upload-server',
  summary: 'Upload server for Meteor. Allows to save and serve files from arbitrary directory',
  version: '1.3.4_3',
  git: 'https://github.com/tomitrescak/meteor-tomi-upload-server.git'
});

Package.onUse(function(api) {
  api.versionsFrom('1.0');

//  api.use('iron:router@1.0.3');
  api.use(['webapp', 'routepolicy'], 'server');

  api.addFiles('upload_server.js', ['server']);
  api.addFiles('router.js');

  // Export the object 'UploadServer' to packages or apps that use this package.
  api.export('UploadServer', 'server');
});

//Package.onTest(function(api) {
//  api.use('tinytest');
//  api.use('tomi:upload-server');
//  api.addFiles('upload-server-tests.js');
//});

Npm.depends({
  formidable: '1.0.17',
  imagemagick: '0.1.3',
  connect: '2.7.10'
})
