{
    "name": "web Graph",
    "category" : "Hidden",
    "description":'Openerp web graph view',
    "version": "3.0",
    "depends": ['web'],
    "js": [
        'static/lib/nvd3/d3.js',
        'static/lib/nvd3/nv.d3.js',
        'static/src/js/graph.js',
        # 'static/src/js/graph_view.js',
        # 'static/src/js/pivot_table.js',
        # 'static/src/js/graph_widget.js',
        ],
    "css": [
        'static/src/css/*.css',
    ],
    'qweb' : [
        "static/src/xml/*.xml",
    ],
    "auto_install": True
}
