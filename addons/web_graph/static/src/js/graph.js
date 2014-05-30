/*---------------------------------------------------------
 * OpenERP web_graph
 *---------------------------------------------------------*/

openerp.web_graph = function (openerp) {
var COLOR_PALETTE = [
    '#cc99ff', '#ccccff', '#48D1CC', '#CFD784', '#8B7B8B', '#75507b',
    '#b0008c', '#ff0000', '#ff8e00', '#9000ff', '#0078ff', '#00ff00',
    '#e6ff00', '#ffff00', '#905000', '#9b0000', '#840067', '#9abe00',
    '#ffc900', '#510090', '#0000c9', '#009b00', '#75507b', '#3465a4',
    '#73d216', '#c17d11', '#edd400', '#fcaf3e', '#ef2929', '#ff00c9',
    '#ad7fa8', '#729fcf', '#8ae234', '#e9b96e', '#fce94f', '#f57900',
    '#cc0000', '#d400a8'];

var QWeb = openerp.web.qweb,
     _lt = openerp.web._lt;
openerp.web.views.add('graph', 'openerp.web_graph.GraphView');
openerp.web_graph.GraphView = openerp.web.View.extend({
    display_name: _lt('Graph'),

    init: function(parent, dataset, view_id, options) {
        this._super(parent);
        this.set_default_options(options);
        this.dataset = dataset;
        this.view_id = view_id;

        this.first_field = null;
        this.abscissa = null;
        this.ordinate = null;
        this.columns = [];
        this.group_field = null;
        this.is_loaded = $.Deferred();

        this.renderer = null;
    },
    start: function() {
        var self = this;
        this._super();
        var loaded;
        if (this.embedded_view) {
            loaded = $.when([self.embedded_view]);
        } else {
            loaded = this.rpc('/web/view/load', {
                    model: this.dataset.model,
                    view_id: this.view_id,
                    view_type: 'graph'
            });
        }
        return $.when(
            this.dataset.call_and_eval('fields_get', [false, {}], null, 1),
            loaded)
            .then(function (fields_result, view_result) {
                self.fields = fields_result[0];
                self.fields_view = view_result[0];
                self.on_loaded(self.fields_view);
            });
    },
    stop: function () {
        if (this.renderer) {
            clearTimeout(this.renderer);
        }
        this._super();
    },
    /**
     * Returns all object fields involved in the graph view
     */
    list_fields: function () {
        var fs = [this.abscissa];
        fs.push.apply(fs, _(this.columns).pluck('name'));
        if (this.group_field) {
            fs.push(this.group_field);
        }
        // var _original = _.difference(this.groupby, fs);
        // fs = _original.concat(this.groupby);
        // fs = fs.concat(this.groupby);
        return _.uniq(fs);
    },
    on_loaded: function() {
        this.chart = this.fields_view.arch.attrs.type || 'pie';
        this.orientation = this.fields_view.arch.attrs.orientation || 'vertical';

        _.each(this.fields_view.arch.children, function (field) {
            var attrs = field.attrs;
            if (attrs.group) {
                this.group_field = attrs.name;
            } else if(!this.abscissa) {
                this.first_field = this.abscissa = attrs.name;
            } else {
                this.columns.push({
                    name: attrs.name,
                    operator: attrs.operator || '+'
                });
            }
        }, this);
        this.ordinate = this.columns[0].name;
        this.is_loaded.resolve();
    },
    schedule_chart: function(results) {
        var self = this;
        this.$element.html(QWeb.render("GraphView", {
            "fields_view": this.fields_view,
            "chart": this.chart,
            'element_id': this.widget_parent.element_id
        }));
        this.width = this.$element.width();
        this.height = Math.min(document.documentElement.clientHeight - this.$element.position().top - 200);
        this.svg = this.$element.find('#'+self.widget_parent.element_id+'-'+self.chart+'chart svg')[0];
        var fields = _(this.columns).pluck('name').concat([this.abscissa]);
        if (this.group_field) { fields.push(this.group_field); }
        // transform search result into usable records (convert from OpenERP
        // value shapes to usable atomic types

        var graph_data = [];

        if (this.groupby.length < 2 || this.chart == "pie") {
            var records = _(results).map(function (result) {
                var point = {};
                _(result).each(function (value, field) {
                    if (!_(fields).contains(field)) { return; }
                    if (value === false) { point[field] = false; return; }
                    switch (self.fields[field].type) {
                    case 'selection':
                        point[field] = _(self.fields[field].selection).detect(function (choice) {
                            return choice[0] === value;
                        })[1];
                        break;
                    case 'many2one':
                        point[field] = value[1];
                        break;
                    case 'integer': case 'float': case 'char':
                    case 'date': case 'datetime':
                        point[field] = value;
                        break;
                    default:
                        throw new Error(
                            "Unknown field type " + self.fields[field].type
                            + "for field " + field + " (" + value + ")");
                    }
                });
                return point;
            });
            // aggregate data, because dhtmlx is crap. Aggregate on abscissa field,
            // leave split on group field => max m*n records where m is the # of
            // values for the abscissa and n is the # of values for the group field
            _(records).each(function (record) {
                var abscissa = record[self.abscissa],
                    group = record[self.group_field];
                var r = _(graph_data).detect(function (potential) {
                    return potential[self.abscissa] === abscissa
                            && (!self.group_field
                                || potential[self.group_field] === group);
                });
                var datapoint = r || {};

                datapoint[self.abscissa] = abscissa;
                if (self.group_field) { datapoint[self.group_field] = group; }
                _(self.columns).each(function (column) {
                    var val = record[column.name],
                        aggregate = datapoint[column.name];
                    switch(column.operator) {
                    case '+':
                        datapoint[column.name] = (aggregate || 0) + val;
                        return;
                    case '*':
                        datapoint[column.name] = (aggregate || 1) * val;
                        return;
                    case 'min':
                        datapoint[column.name] = (aggregate || Infinity) > val
                                               ? val
                                               : aggregate;
                        return;
                    case 'max':
                        datapoint[column.name] = (aggregate || -Infinity) < val
                                               ? val
                                               : aggregate;
                    }
                });

                if (!r) { graph_data.push(datapoint); }
            });
            graph_data = _(graph_data).sortBy(function (point) {
                return point[self.abscissa] + '[[--]]' + point[self.group_field];
            });
            if (this.chart != "pie")
                graph_data = [{
                    'key': self.options.action.name,
                    'values': graph_data
                }];
        } else {
        //  start of a new grouping function
            var level_1 = _.unique(_.pluck(results, self.groupby[0]),function(el) { return el[0]; }),
                level_2 = _.unique(_.pluck(results, self.groupby[1]),function(el) { return el[0]; });
                __get_name = function (obj) {
                    if (typeof(obj) == "object")
                        return _.find(obj, function(el) { return typeof(el) == 'string' }) || "";
                    else if (typeof(obj) != "string")
                        return obj.toString();
                    else
                        return obj;
                };
            _.each(level_2, function(dim2) {
                var _temp = [];
                _.each(level_1, function (dim1) {
                    var __y = _(_.filter(results, function (rec) {
                        if (_.isEqual(rec[self.groupby[0]], dim1) && _.isEqual(rec[self.groupby[1]], dim2)) {
                            return rec;
                        }
                    })).pluck(self.ordinate);
                    var _sum = _.reduce(__y, function(memo, num){ return memo + num; }, 0);
                    _temp.push({ 'x': __get_name(dim1), 'y': _sum });
                })
                graph_data.push({'key': __get_name(dim2), 'values': _temp });
            });
        }

        if (_.include(['bar','line','area'],this.chart)) {
            return this.bar_chart(graph_data);
        } else if (this.chart == "pie") {
            return this.pie_chart(graph_data);
        }
    },
    bar_chart: function(data){
        var self = this;
        nv.addGraph(function () {
            var chart = nv.models.multiBarChart()
                .width(self.width)
                .height(self.height)
                .reduceXTicks(false)
                .stacked(self.groupby == false)
                .showControls(self.groupby != false)
                ;
            if (self.groupby.length < 2) {
                chart.x(function(d) { return d[self.abscissa] }).y(function(d) { return d[self.ordinate] });
            }
            if (self.width / data[0].values.length < 80) {
                chart.rotateLabels(-15);
                chart.reduceXTicks(true);
                chart.margin({bottom:40});
            }
            d3.select(self.svg)
                .datum(data)
                .attr('width', self.width)
                .attr('height', self.height)
                .call(chart);
            nv.utils.windowResize(chart.update);
            return chart;
        });
    },

    pie_chart: function(data) {
        var self = this;
        if (data.length > 10) {
            var new_data = [];
            while (new_data.length <= 10) {
                var _max = _.max(data, function(rec) { return rec[self.ordinate]; });
                if ( new_data.indexOf(_max)<0 ) {
                    new_data.push(_max);
                    data = _.without(data,_max);
                }
            }
            data = new_data;
            var __extra = {};
            var _other_abscissa = self.abscissa;
            var _other_ordinate = self.ordinate;
            var _other_ordinate_total = _.reduce(data, function(memo, num) { return memo + num[self.ordinate]; }, 0 );
            __extra[_other_abscissa] = 'Other';
            __extra[_other_ordinate] = _other_ordinate_total;
            data.push(__extra);
        }
        nv.addGraph(function () {
            var chart = nv.models.pieChart()
                .x(function(d) { return d[self.abscissa] })
                .y(function(d) { return d[self.ordinate] })
                .showLabels(true)
                .color(d3.scale.category20b().range())
                // .width(self.width)
                // .height(self.height);
              ;
            d3.select(self.svg)
                .datum(data)
                .transition().duration(1200)
                // .attr('width', self.width)
                // .attr('height', self.height)
                .call(chart);
            nv.utils.windowResize(chart.update);
            return chart;
        });
    },
    open_list_view : function (id){
        var self = this;
        // unconditionally nuke tooltips before switching view
        $(".dhx_tooltip").remove('div');
        id = id[this.abscissa];
        if(this.fields[this.abscissa].type == "selection"){
            id = _.detect(this.fields[this.abscissa].selection,function(select_value){
                return _.include(select_value, id);
            });
        }
        if (typeof id == 'object'){
            id = id[0];
        }

        var views;
        if (this.widget_parent.action) {
            views = this.widget_parent.action.views;
            if (!_(views).detect(function (view) {
                    return view[1] === 'list' })) {
                views = [[false, 'list']].concat(views);
            }
        } else {
            views = _(["list", "form", "graph"]).map(function(mode) {
                return [false, mode];
            });
        }
        this.do_action({
            res_model : this.dataset.model,
            domain: [[this.abscissa, '=', id], ['id','in',this.dataset.ids]],
            views: views,
            type: "ir.actions.act_window",
            flags: {default_view: 'list'}
        });
    },

    do_search: function(domain, context, group_by) {
        var self = this;
        return $.when(this.is_loaded).pipe(function() {
            self.groupby = [];
            // TODO: handle non-empty group_by with read_group?
            if (!_(group_by).isEmpty()) {
                self.abscissa = group_by[0];
                self.groupby = group_by;
            } else {
                self.abscissa = self.first_field;
            }
            return self.dataset.read_slice((_.difference(self.list_fields(),self.groupby)).concat(self.groupby)).then($.proxy(self, 'schedule_chart'));
        });
    },

    do_show: function() {
        this.do_push_state({});
        return this._super();
    }
});
};
// vim:et fdc=0 fdl=0:
