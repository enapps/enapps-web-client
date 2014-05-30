/*---------------------------------------------------------
 * OpenERP Web Boostrap Code
 *---------------------------------------------------------*/
var openerp = {};
/**
 * @name openerp
 * @namespace openerp
 */
(function() {
    // copy everything in the openerp namespace to openerp.web
    openerp.web = {};
    var inited = false;

    _.extend(openerp, {
        // this unique id will be replaced by hostname_databasename by
        // openerp.web.Session on the first connection
        _session_id: "instance0",
        _modules: ['web'],
        web_mobile: {},
        /**
         * OpenERP instance constructor
         *
         * @param {Array|String} modules list of modules to initialize
         */
        init: function(modules) {
            if (modules === null) {
                modules = [];
            }
            modules = _.without(modules, "web");
            if (inited)
                throw new Error("OpenERP was already inited");
            inited = true;
            for(var i=0; i < modules.length; i++) {
                var fct = openerp[modules[i]];
                if (typeof(fct) === "function") {
                    openerp[modules[i]] = {};
                    for (var k in fct) {
                        openerp[modules[i]][k] = fct[k];
                    }
                    fct(openerp, openerp[modules[i]]);
                }
            }
            openerp._modules = ['web'].concat(modules);
            return openerp;
        }
    });
})();

/*---------------------------------------------------------
 * OpenERP Web web module split
 *---------------------------------------------------------*/

/**
 * @namespace
 */

// vim:et fdc=0 fdl=0 foldnestmax=3 fdm=syntax:
