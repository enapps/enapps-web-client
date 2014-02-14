module.exports = function(grunt) {

  // Project configuration.
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),

    copy: {
      main: {
       files: [
           {
                src     : ['addons/web/static/themes/' + (grunt.option('theme') || 'v6') + '/xml/*'],
                dest    : 'addons/web/static/build/xml/',
                flatten : true,
                expand  : true
           }
       ]
      },
    },

    sass: {
        dev: {
            files: {
                'addons/web/static/build/css/sass.css' : [
                "addons/web/static/themes/"+ (grunt.option('theme') || 'v6') + "/sass/*.sass",
                "addons/web/static/themes/"+ (grunt.option('theme') || 'v6') + "/css/*.css",
                ]
            }
        },

        prod: {
            options: {
              yuicompress: true
            },
            files: {
                'addons/web/static/build/css/sass.css' : [
                "addons/web/static/themes/"+ (grunt.option('theme') || 'v6') + "/sass/*.sass",
                "addons/web/static/themes/"+ (grunt.option('theme') || 'v6') + "/css/*.css",
                ]
            }
        }
    },

    less: {
        dev: {
            files: {
              "addons/web/static/build/css/style.css":
              [
                  "addons/web/static/build/css/sass.css",
                  "addons/web/static/themes/"+ (grunt.option('theme') || 'v6') + "/less/style.less"
              ]
            }
            },
            prod: {
            options: {
              yuicompress: true
            },

            files: {
              "addons/web/static/build/css/style.css":
              [
                  "addons/web/static/build/css/sass.css",
                  "addons/web/static/themes/"+ (grunt.option('theme') || 'v6') + "/less/style.less"
              ]
            }
        }
    }
  });
  grunt.file.write('addons/web/static/build/css/theme.txt',grunt.option('theme') || 'v6');
  grunt.loadNpmTasks('grunt-contrib-sass');
  grunt.loadNpmTasks('grunt-contrib-less');
  grunt.loadNpmTasks('grunt-contrib-copy');
  grunt.registerTask('default', ['copy:main', 'sass:dev', 'less:dev']);
  grunt.registerTask('prod', ['copy:main', 'sass:prod', 'less:prod']);

};

