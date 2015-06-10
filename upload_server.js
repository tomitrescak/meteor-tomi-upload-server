var formidable = Npm.require('formidable');
var http = Npm.require('http');
var sys = Npm.require('sys');
//var connect = Npm.require('connect');
var url = Npm.require('url');
var path = Npm.require('path');
var fs = Npm.require('fs');
var Fiber = Npm.require('fibers');

var _existsSync = fs.existsSync || path.existsSync;
var imageMagick = Npm.require('imagemagick');

var options = {
  /** @type String*/
  tmpDir: null,
  /** @type String*/
  uploadDir: null,
  uploadUrl: '/upload/',
  checkCreateDirectories: false,
  maxPostSize: 11000000000, // 11 GB
  minFileSize: 1,
  maxFileSize: 10000000000, // 10 GB
  acceptFileTypes: /.+/i,
  // Files not matched by this regular expression force a download dialog,
  // to prevent executing any scripts in the context of the service domain:
  inlineFileTypes: /\.(gif|jpe?g|png)$/i,
  imageTypes: /\.(gif|jpe?g|png)$/i,
  imageVersions: {
    'thumbnail': {
      width: 200,
      height: 200
    }
  },
  cacheTime: 86400,
  getDirectory: function (fileInfo, formData) {
    return ""
  },
  getFileName: function (fileInfo, formData) {
    return fileInfo.name;
  },
  finished: function () {
  },
  validateRequest: function () {
    return null;
  },
  validateFile: function () {
    return null;
  },
  accessControl: {
    allowOrigin: '*',
    allowMethods: 'OPTIONS, HEAD, GET, POST, PUT, DELETE',
    allowHeaders: 'Content-Type, Content-Range, Content-Disposition'
  },
  mimeTypes: {
    "html": "text/html",
    "jpeg": "image/jpeg",
    "jpg": "image/jpeg",
    "png": "image/png",
    "gif": "image/gif",
    "js": "text/javascript",
    "css": "text/css",
    "pdf": "application/pdf",
    "doc": "application/msword",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "zip": "application/zip, application/x-compressed-zip",
    "txt": "text/plain"
  }
  /* Uncomment and edit this section to provide the service via HTTPS:
   ssl: {
   key: fs.readFileSync('/Applications/XAMPP/etc/ssl.key/server.key'),
   cert: fs.readFileSync('/Applications/XAMPP/etc/ssl.crt/server.crt')
   },
   */
};


UploadServer = {
  init: function (opts) {
    if (opts.checkCreateDirectories != null) options.checkCreateDirectories = opts.checkCreateDirectories;

    if (opts.tmpDir == null) {
      throw new Meteor.Error('Temporary directory needs to be assigned!');
    } else {
      options.tmpDir = opts.tmpDir;
    }

    if (opts.cacheTime) {
      options.cacheTime = opts.cacheTime;
    }

    if (opts.mimeTypes != null) {
      for (var key in opts.mimeTypes) {
        options.mimeTypes[key] = opts.mimeTypes[key];
      }
    }

    if (opts.checkCreateDirectories) {
      checkCreateDirectory(options.tmpDir);
    }

    if (opts.uploadDir == null) {
      throw new Meteor.Error('Upload directory needs to be assigned!');
    } else {
      options.uploadDir = opts.uploadDir;
    }

    if (options.checkCreateDirectories) {
      checkCreateDirectory(options.uploadDir);
    }

    if (opts.maxPostSize != null) options.maxPostSize = opts.maxPostSize;
    if (opts.minFileSize != null) options.minFileSize = opts.maxPostSize;
    if (opts.maxFileSize != null) options.maxFileSize = opts.maxFileSize;
    if (opts.acceptFileTypes != null) options.acceptFileTypes = opts.acceptFileTypes;
    if (opts.imageTypes != null) options.imageTypes = opts.imageTypes;
    if (opts.validateRequest != null) options.validateRequest = opts.validateRequest;
    if (opts.validateFile != null) options.validateFile = opts.validateFile;
    if (opts.getDirectory != null) options.getDirectory = opts.getDirectory;
    if (opts.getFileName != null) options.getFileName = opts.getFileName;
    if (opts.finished != null) options.finished = opts.finished;

    if (opts.uploadUrl) options.uploadUrl = opts.uploadUrl;

    if (opts.imageVersions != null) options.imageVersions = opts.imageVersions
    else options.imageVersions = [];
  },
  delete: function (filePath) {

    // make sure paths are correct
    fs.unlinkSync(path.join(options.uploadDir, filePath));
  },
  serve: function (req, res) {
    if (options.tmpDir == null || options.uploadDir == null) {
      throw new Meteor.Error('Upload component not initialised!');
    }

    res.setHeader(
      'Access-Control-Allow-Origin',
      options.accessControl.allowOrigin
    );
    res.setHeader(
      'Access-Control-Allow-Methods',
      options.accessControl.allowMethods
    );
    res.setHeader(
      'Access-Control-Allow-Headers',
      options.accessControl.allowHeaders
    );
    var handleResult = function (result, redirect) {
        if (redirect) {
          res.writeHead(302, {
            'Location': redirect.replace(
              /%s/,
              encodeURIComponent(JSON.stringify(result))
            )
          });
          res.end();
        } else if (result.error) {
          res.writeHead(403, {'Content-Type': 'text/plain'});
          res.write(result.error);
          res.end();
        } else {
          //res.writeHead(200, {
          //  'Content-Type': req.headers.accept
          //    .indexOf('application/json') !== -1 ?
          //    'application/json' : 'text/plain'
          //});
          res.end(JSON.stringify(result));
        }
      },
      setNoCacheHeaders = function () {
        if (options.cacheTime) {
          res.setHeader('Cache-Control', 'public, max-age=' + options.cacheTime);
        } else {
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
          // res.setHeader('Content-Disposition', 'inline; filename="files.json"');
        }
      },
      handler = new UploadHandler(req, res, handleResult);


    // validate the request
    var error = options.validateRequest(req, res);
    if (error) {
      res.writeHead(403, {'Content-Type': 'text/plain'});
      res.write(error);
      res.end();
      return;
    }

    switch (req.method) {
      case 'OPTIONS':
        res.end();
        break;
      case 'HEAD':
      case 'GET':
        setNoCacheHeaders();

        var uri = url.parse(req.url).pathname;
        var filename = path.join(options.uploadDir, unescape(uri));
        var stats;

        try {
          stats = fs.lstatSync(filename); // throws if path doesn't exist
        } catch (e) {
          res.writeHead(404, {'Content-Type': 'text/plain'});
          res.write('404 Not Found\n');
          res.end();
          return;
        }

        if (stats.isFile()) {
          // path exists, is a file
          var mimeType = options.mimeTypes[path.extname(filename).split(".").reverse()[0]];
          if (!mimeType) {
            mimeType = "application/octet-stream";
          }
          res.writeHead(200, {'Content-Type': mimeType});

          //connect.static(options.uploadDir)(req, res);
          var fileStream = fs.createReadStream(filename);
          fileStream.pipe(res);

        } else if (stats.isDirectory()) {
          // path exists, is a directory
          res.writeHead(403, {'Content-Type': 'text/plain'});
          res.write('Access denied');
          res.end();
        } else {
          res.writeHead(500, {'Content-Type': 'text/plain'});
          res.write('500 Internal server error\n');
          res.end();
        }
        break;
      case 'POST':
        // validate post
        setNoCacheHeaders();
        handler.post();
        break;
      //case 'DELETE':
      //  handler.destroy();
      //  break;
      default:
        res.statusCode = 405;
        res.end();
    }
  }
}

var utf8encode = function (str) {
  return unescape(encodeURIComponent(str));
};

var nameCountRegexp = /(?:(?: \(([\d]+)\))?(\.[^.]+))?$/;

var nameCountFunc = function (s, index, ext) {
  return ' (' + ((parseInt(index, 10) || 0) + 1) + ')' + (ext || '');
};

/**
 * @class FileInfo Manages paths for uploaded objects
 */
var FileInfo = function (file) {
  this.name = file.name;
  this.path = file.name;
  this.size = file.size;
  this.type = file.type;
};

FileInfo.prototype.validate = function () {
  this.error = null;
  if (options.minFileSize && options.minFileSize > this.size) {
    this.error = 'File is too small';
  } else if (options.maxFileSize && options.maxFileSize < this.size) {
    this.error = 'File is too big';
  } else if (!options.acceptFileTypes.test(this.name)) {
    this.error = 'Filetype not allowed';
  }
  return this.error;
};

FileInfo.prototype.safeName = function () {
  // Prevent directory traversal and creating hidden system files:
  this.name = path.basename(this.name).replace(/^\.+/, '');
  // Prevent overwriting existing files:
  while (_existsSync(options.uploadDir + '/' + this.name)) {
    this.name = this.name.replace(nameCountRegexp, nameCountFunc);
  }
};

FileInfo.prototype.initUrls = function (req, form) {
  if (!this.error) {
    var that = this,
      subDirectory = options.getDirectory(this.name, form.formFields),
      baseUrl = (options.ssl ? 'https:' : 'http:') +
        '//' + req.headers.host + options.uploadUrl;
    this.url = baseUrl + (subDirectory ? (subDirectory + '/') : '') + encodeURIComponent(this.name);

    // image
    Object.keys(options.imageVersions).forEach(function (version) {
      if (_existsSync(
          options.uploadDir + '/' + version + '/' + that.name
        )) {
        that[version + 'Url'] = baseUrl + version + '/' +
        encodeURIComponent(that.name);
      }
    });
  }
};

var UploadHandler = function (req, res, callback) {
  this.req = req;
  this.res = res;
  this.callback = callback;
};

UploadHandler.prototype.post = function () {
  var handler = this,
    form = new formidable.IncomingForm(),
    tmpFiles = [],
    files = [],
    map = {},
    counter = 1,
    redirect,
    finish = function () {
      counter -= 1;
      if (!counter) {
        files.forEach(function (fileInfo) {
          fileInfo.initUrls(handler.req, form);
        });
        handler.callback({files: files}, redirect);
      }
    };
  form.uploadDir = options.tmpDir;
  form.on('fileBegin', function (name, file) {
    tmpFiles.push(file.path);
    var fileInfo = new FileInfo(file, handler.req, true);

    //fileInfo.safeName();

    // validate post
    var error = options.validateFile(file);
    if (error) {
      res.writeHead(403, {'Content-Type': 'text/plain'});
      res.write(error);
      res.end();
      return;
    }

    map[path.basename(file.path)] = fileInfo;
    files.push(fileInfo);
  }).on('field', function (name, value) {
    if (name === 'redirect') {
      redirect = value;
    }
    // remember all the form fields
    if (this.formFields == null) {
      this.formFields = {};
    }
    //  console.log('Form field: ' + name + "-" + value);
    this.formFields[name] = value;
  }).on('file', function (name, file) {
    var fileInfo = map[path.basename(file.path)];
    fileInfo.size = file.size;

    var error = fileInfo.validate();
    if (error) {
      // delete file
      fs.unlinkSync(file.path);
      // callback with error
      handler.callback({error: error});
      return;
    }

    // we can store files in subdirectories
    var folder = options.getDirectory(fileInfo, this.formFields);

    // make safe directory, disable all '.'
    folder.replace(/\./g, '');

    // check if directory exists, if not, create all the directories
    var subFolders = folder.split('/');
    var currentFolder = options.uploadDir;
    for (var i = 0; i < subFolders.length; i++) {
      currentFolder += '/' + subFolders[i];

      if (!fs.existsSync(currentFolder)) {
        fs.mkdirSync(currentFolder);
      }
    }

    // possibly rename file if needed;
    var newFileName = options.getFileName(fileInfo, this.formFields);

    // make safe file name
    newFileName = getSafeName(currentFolder, newFileName);
    console.log(currentFolder + "...." + newFileName);

    // set the file name
    fileInfo.name = newFileName;
    fileInfo.path = folder + "/" + newFileName;

    fs.renameSync(file.path, currentFolder + "/" + newFileName);

    if (options.imageTypes.test(fileInfo.name)) {
      Object.keys(options.imageVersions).forEach(function (version) {
        counter += 1;
        var opts = options.imageVersions[version];

        // check if version directory exists
        if (!fs.existsSync(currentFolder + '/' + version)) {
          fs.mkdirSync(currentFolder + '/' + version);
        }

        imageMagick.resize({
          width: opts.width,
          height: opts.height,
          srcPath: currentFolder + '/' + newFileName,
          dstPath: currentFolder + '/' + version + '/' + newFileName
        }, finish);
      });
    }

    // call the feedback within its own fiber
    var formFields = this.formFields;
    Fiber(function () {
      options.finished(fileInfo, formFields);
    }).run();

  }).on('aborted', function () {
    tmpFiles.forEach(function (file) {
      fs.unlink(file);
    });
  }).on('error', function (e) {
    console.log('ERROR');
    console.log(e);
  }).on('progress', function (bytesReceived, bytesExpected) {
    if (bytesReceived > options.maxPostSize) {
      handler.req.connection.destroy();
    }
  }).on('end', finish).parse(handler.req);
};

UploadHandler.prototype.destroy = function () {
  var handler = this,
    fileName;
  if (handler.req.url.slice(0, options.uploadUrl.length) === options.uploadUrl) {
    fileName = path.basename(decodeURIComponent(handler.req.url));
    if (fileName[0] !== '.') {
      fs.unlink(options.uploadDir + '/' + fileName, function (ex) {
        Object.keys(options.imageVersions).forEach(function (version) {
          fs.unlink(options.uploadDir + '/' + version + '/' + fileName);
        });
        handler.callback({success: !ex});
      });
      return;
    }
  }
  handler.callback({success: false});
};

// create directories

var checkCreateDirectory = function (dir) {
  if (!dir) {
    return;
  }

  var dirParts = dir.split('/');
  var currentDir = '/';

  for (var i = 0; i < dirParts.length; i++) {
    if (!dirParts[i]) {
      continue;
    }

    currentDir += dirParts[i] + '/';

    if (!fs.existsSync(currentDir)) {
      fs.mkdirSync(currentDir);
      console.log('Created directory: ' + currentDir);
    }
  }
}

var getSafeName = function(directory, fileName) {
	var n = fileName;
	// Prevent directory traversal and creating hidden system files:
	n = path.basename(n).replace(/^\.+/, '');
	// Prevent overwriting existing files:
	while (_existsSync(directory + '/' + n)) {
		n = n.replace(nameCountRegexp, nameCountFunc);
	}
	return n;
}

// declare routes

RoutePolicy.declare(options.uploadUrl, 'network');
WebApp.connectHandlers.use(options.uploadUrl, UploadServer.serve);
