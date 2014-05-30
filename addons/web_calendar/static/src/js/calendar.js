/*---------------------------------------------------------
 * OpenERP web_calendar
 *---------------------------------------------------------*/

openerp.web_calendar = {};
var _t = openerp.web._t,
   _lt = openerp.web._lt;
var QWeb = openerp.web.qweb;
openerp.web.views.add('calendar', 'openerp.web_calendar.CalendarView');
openerp.web_calendar.CalendarView = openerp.web.View.extend({
    display_name: _lt('Calendar'),
// Dhtmlx scheduler ?
    init: function(parent, dataset, view_id, options) {
        _calendar = this;

        this._super(parent);
        this.ready = $.Deferred();
        this.set_default_options(options);
        this.dataset = dataset;
        this.model = dataset.model;
        this.fields_view = {};
        this.view_id = view_id;
        this.has_been_loaded = $.Deferred();
        this.creating_event_id = null;
        this.dataset_events = [];
        this.form_dialog = new openerp.web_calendar.CalendarFormDialog(this, {
                destroy_on_close: false,
                width: '80%',
                min_width: 850
            }, this.options.action_views_ids.form, dataset);
        this.form_dialog.start();
        this.COLOR_PALETTE = ['#f57900', '#cc0000', '#d400a8', '#75507b', '#3465a4', '#73d216', '#c17d11', '#edd400',
             '#fcaf3e', '#ef2929', '#ff00c9', '#ad7fa8', '#729fcf', '#8ae234', '#e9b96e', '#fce94f',
             '#ff8e00', '#ff0000', '#b0008c', '#9000ff', '#0078ff', '#00ff00', '#e6ff00', '#ffff00',
             '#905000', '#9b0000', '#840067', '#510090', '#0000c9', '#009b00', '#9abe00', '#ffc900' ];
        this.color_map = {};
        this.last_search = [];
        this.range_start = null;
        this.range_stop = null;
        this.update_range_dates(Date.today());
        this.selected_filters = [];
    },
    start: function() {
        this._super();
        return this.rpc("/web/view/load", {"model": this.model, "view_id": this.view_id, "view_type":"calendar", 'toolbar': true}, this.on_loaded);
    },
    stop: function() {
        this.$element.fullCalendar('destroy');
        this._super();
    },
    on_loaded: function(data) {
        this.fields_view = data;
        this.calendar_fields = {};
        this.ids = this.dataset.ids;
        this.color_values = [];
        this.info_fields = [];

        this.name = this.fields_view.name || this.fields_view.arch.attrs.string;
        this.view_id = this.fields_view.view_id;

        // mode, one of month, week or day
        this.mode = this.fields_view.arch.attrs.mode;

        // date_start is mandatory, date_delay and date_stop are optional
        this.date_start = this.fields_view.arch.attrs.date_start;
        this.date_delay = this.fields_view.arch.attrs.date_delay;
        this.date_stop = this.fields_view.arch.attrs.date_stop;

        this.day_length = this.fields_view.arch.attrs.day_length || 8;
        this.color_field = this.fields_view.arch.attrs.color;
        this.color_string = this.fields_view.fields[this.color_field] ?
            this.fields_view.fields[this.color_field].string : _t("Filter");

        if (this.color_field && this.selected_filters.length === 0) {
            var default_filter;
            if (default_filter = this.dataset.context['calendar_default_' + this.color_field]) {
                this.selected_filters.push(default_filter + '');
            }
        }
        this.fields =  this.fields_view.fields;

        if (!this.date_start) {
            throw new Error("Calendar view has not defined 'date_start' attribute.");
        }

        //* Calendar Fields *
        this.calendar_fields.date_start = {'name': this.date_start, 'kind': this.fields[this.date_start].type};

        if (this.date_delay) {
            if (this.fields[this.date_delay].type != 'float') {
                throw new Error("Calendar view has a 'date_delay' type != float");
            }
            this.calendar_fields.date_delay = {'name': this.date_delay, 'kind': this.fields[this.date_delay].type};
        }
        if (this.date_stop) {
            this.calendar_fields.date_stop = {'name': this.date_stop, 'kind': this.fields[this.date_stop].type};
        }

        for (var fld = 0; fld < this.fields_view.arch.children.length; fld++) {
            this.info_fields.push(this.fields_view.arch.children[fld].attrs.name);
        }
        this.$element.html(QWeb.render("CalendarView", {"fields_view": this.fields_view}));

        this.init_calendar();

        this.has_been_loaded.resolve();
    },
    set_selected_ids: function(start_date, end_date) {
        var self = this, selected = [];
        if (start_date - end_date == 0) {
            end_date.setHours(23); end_date.setMinutes(59); end_date.setSeconds(59);
        }
        selected = _.filter(this.dataset_events, function(event) {
            if (
                event.start >= start_date && event.end <= end_date
                || event.start <=end_date && event.start>=start_date
                || event.end <= end_date && event.end >= start_date
                )
                return event;
        });
        return this.selected_ids = _.pluck(selected, 'id');
    },
    get_fc_init_options: function() {
        var self = this;
        fc_defaultOptions = {};
        return $.extend({}, fc_defaultOptions, {
                defaultView: (this.mode == "month")?"month":
                    (this.mode == "week"?"agendaWeek":
                     (this.mode == "day"?"agendaDay":"month")),
                header: {
                    left: 'prev,next today',
                    center: 'title',
                    right: 'month,agendaWeek,agendaDay'
                },
                selectable: true,
                selectHelper: true,
                editable: !this.options.read_only_mode,
                droppable: true,

                // callbacks
                eventDrop: function (event, _day_delta, _minute_delta, _all_day, _revertFunc) {
                    self.do_save_event(event.id, event);
                },
                eventResize: function (event, _day_delta, _minute_delta, _revertFunc) {
                    // var data = self.get_event_data(event);
                },
                eventRender: function (event, element, view) {
                    element.find('.fc-event-title').html(event.title);
                },
                eventAfterRender: function (event, element, view) {
                    if ((view.name !== 'month') && (((event.end-event.start)/60000)<=30)) {
                        //if duration is too small, we see the html code of img
                        var current_title = $(element.find('.fc-event-time')).text();
                        var new_title = current_title.substr(0,current_title.indexOf("<img")>0?current_title.indexOf("<img"):current_title.length)
                        element.find('.fc-event-time').html(new_title);
                    }
                },
                eventClick: function (event) {
                    self.open_event(event.id, event.title);
                },
                select: function (start_date, end_date, all_day, _js_event, _view) {
                    self.set_selected_ids(start_date, end_date);
                },
                drop: function(start_date, all_day) {
                    if (this.classList.contains("ui-dialog")) {
                        return;
                    }
                    var data_template = self.get_event_data({
                        start: start_date,
                        allDay: all_day,
                    });
                    var stored_data = $(this).data('eventDefaults');

                    data_template = $.extend({}, stored_data, data_template);
                    self.open_quick_create(data_template);
                },
                unselectAuto: false,

                // Options
                weekNumbers: true,
                snapMinutes: 15,
                timeFormat : {
                           // for agendaWeek and agendaDay
                            agenda: 'h:mm{ - h:mm}', // 5:00 - 6:30
                            // for all other views
                            '': 'h(:mm)tt'            // 7pm
                        },
                weekMode : 'liquid',
                aspectRatio: 1.8,
            });
    },
    init_calendar: function() {
        var self = this;
        this.$element.empty();
        this.$element.fullCalendar(self.get_fc_init_options());
        if (this.options.sidebar && this.options.sidebar_id) {
            this.sidebar = new openerp.web.Sidebar(this, this.options.sidebar_id);
            this.sidebar.start();
            if (!!this.sidebar.navigator) this.sidebar.navigator.stop();
            this.sidebar.navigator = new openerp.web_calendar.SidebarNavigator(this.sidebar, this);
            this.sidebar.navigator.$element.datepicker({ 'onSelect': self.calendarMiniChanged.call(self,arguments) });
            this.sidebar.responsible = new openerp.web_calendar.SidebarResponsible(this.sidebar, this);
            this.sidebar.add_toolbar(this.fields_view.toolbar);
            this.set_common_sidebar_sections(this.sidebar);
            this.sidebar.do_unfold();
            // REFRESH AFTER SIDEBAR WAS TOGGLED
            this.sidebar.do_toggle.add_last(function(){
                $(window).resize();
            });
        }
    },
    calendarMiniChanged: function() {
        var self = this,
            $el = this.$element;
            datum = arguments[0],
            obj = arguments[1];
        return function(datum,obj) {
                var curView = $el.fullCalendar( 'getView');
                var curDate = new Date(obj.currentYear , obj.currentMonth, obj.currentDay);

                if (curView.name == "agendaWeek") {
                    if (curDate <= curView.end && curDate >= curView.start) {
                        $el.fullCalendar('changeView','agendaDay');
                    }
                }
                else if (curView.name != "agendaDay" || (curView.name == "agendaDay" && curDate.compareTo(curView.start)==0)) {
                        $el.fullCalendar('changeView','agendaWeek');
                }
                $el.fullCalendar('gotoDate', obj.currentYear , obj.currentMonth, obj.currentDay);
            }
    },
    get_event_data: function(event) {
         // Normalize event_end without changing fullcalendars event.
            var data = {
                name: event.title
            };
            var event_end = event.end;
            //Bug when we move an all_day event from week or day view, we don't have a dateend or duration...            
            if (event_end == null) {
                event_end = new Date(event.start).addHours(2);
            }
            if (event.allDay) {
                // Sometimes fullcalendar doesn't give any event.end.
                if (event_end === null || _.isUndefined(event_end)) {
                    event_end = new Date(event.start);
                }
                if (this.all_day) {
                    event_end = (new Date(event_end.getTime())).addDays(1); 
                    date_start_day = new Date(Date.UTC(event.start.getFullYear(),event.start.getMonth(),event.start.getDate()))
                    date_stop_day = new Date(Date.UTC(event_end.getFullYear(),event_end.getMonth(),event_end.getDate()))
                }
                else {
                    date_start_day = new Date(Date.UTC(event.start.getFullYear(),event.start.getMonth(),event.start.getDate(),7))
                    date_stop_day = new Date(Date.UTC(event_end.getFullYear(),event_end.getMonth(),event_end.getDate(),19))
                }
                data[this.date_start] = openerp.web.parse_value(date_start_day, this.fields[this.date_start]);
                if (this.date_stop) {
                    data[this.date_stop] = openerp.web.parse_value(date_stop_day, this.fields[this.date_stop]);
                }
            }
            else {
                data[this.date_start] = openerp.web.parse_value(event.start, this.fields[this.date_start]);
                if (this.date_stop) {
                    data[this.date_stop] = openerp.web.parse_value(event_end, this.fields[this.date_stop]);
                }
            }
            if (this.all_day) {
                data[this.all_day] = event.allDay;
            }
            if (this.date_delay) {
                var diff_seconds = Math.round((event_end.getTime() - event.start.getTime()) / 1000);
                data[this.date_delay] = diff_seconds / 3600;
            }
            return data;
    },
    open_event: function(event_id, event_title) {
        // if (this.config.readonly) return;
        var _action_manager = window.openerp.webclient.action_manager,
            _action = _action_manager.inner_viewmanager.action;
        _action = _.extend(_action, {
            'target': "new",
            'view_type': "form",
            'res_id': event_id,
            'context.active_id': 1,
            'flags': {
                'default_view': "form",
                'action_buttons': true,
                'auto_search': false,
                'display_title': false,
                'pager': false,
                'search_view': false,
                'sidebar': false,
                'views_switcher': false,
            }
        });
        _action_manager.do_action(_action);
    },
    is_view_changed: function(date) {
        var changed = false;
        if (!date.between(this.range_start, this.range_stop)) {
            this.update_range_dates(date);
            changed = true;
            // this.do_ranged_search();
        }
        this.ready.resolve();
        return changed;
    },
    update_range_dates: function(date) {
        this.range_start = date.clone().moveToFirstDayOfMonth();
        this.range_stop = this.range_start.clone().addMonths(1).addSeconds(-1);
    },
    refresh_scheduler: function() {
    },
    refresh_minical: function() {
        if (this.options.sidebar) {
            scheduler.updateCalendar(this.mini_calendar);
        }
    },
    reload_event: function(id) {
        this.dataset.read_ids([id], _.keys(this.fields)).then(this.on_events_loaded);
    },
    get_color: function(key) {
        if (this.color_map[key]) {
            return this.color_map[key];
        }
        var index = _.keys(this.color_map).length % this.COLOR_PALETTE.length;
        var color = this.COLOR_PALETTE[index];
        this.color_map[key] = color;
        return color;
    },
    _parse_data: function(obj) {
        var self = this;

    },
    on_events_loaded: function(events, fn_filter, no_filter_reload) {
    },
    convert_event: function(evt) {
        var self = this;
        var date_start = openerp.web.str_to_datetime(evt[this.date_start]),
            date_stop = this.date_stop ? openerp.web.str_to_datetime(evt[this.date_stop]) : null,
            date_delay = evt[this.date_delay] || 1.0,
            res_text = '';

        if (this.info_fields) {
            res_text = _(this.info_fields).chain()
                .filter(function(fld) {
                    return self.fields[fld].type == 'boolean' ? fld : !_.isBoolean(evt[fld]) && fld; })
                .map(function(fld) { return (evt[fld] instanceof Array) ? evt[fld][1] : evt[fld]; }).value();
        }
        if (!date_stop && date_delay) {
            date_stop = date_start.clone().addHours(date_delay);
        }
        var r = _.extend(evt, {
            'date': date_start.toString('yyyy-MM-dd HH:mm:ss'),
            'end': date_stop.toString('yyyy-MM-dd HH:mm:ss'),
            'title': res_text.join(', '),
            'id': evt.id
        });
        if (evt.color) {
            r.color = evt.color;
        }
        if (evt.textColor) {
            r.textColor = evt.textColor;
        }
        return r;
    },
    do_create_event: function(event_id, event_obj) {
        var self = this,
            data = this.get_event_data(event_obj);
        this.dataset.create(data, function(r) {
            var id = r.result;
            self.dataset.ids.push(id);
            scheduler.changeEventId(event_id, id);
            self.refresh_minical();
            self.reload_event(id);
        }, function(r, event) {
            event.preventDefault();
            self.do_create_event_with_formdialog(event_id, event_obj);
        });
    },
    do_create_event_with_formdialog: function(event_id, event_obj) {
        if (!event_obj) {
            event_obj = scheduler.getEvent(event_id);
        }
        var self = this,
            data = this.get_event_data(event_obj),
            form = self.form_dialog.form,
            fields_to_fetch = _(form.fields_view.fields).keys();
        this.dataset.index = null;
        self.creating_event_id = event_id;
        // this.form_dialog.form.do_show().then(function() {
        //     _.each(['date_start', 'date_delay', 'date_stop'], function(field) {
        //         var field_name = self[field];
        //         if (field_name && form.fields[field_name]) {
        //             var ffield = form.fields[field_name];
        //             ffield.reset();
        //             $.when(ffield.set_value(data[field_name])).then(function() {
        //                 ffield.validate();
        //                 ffield.dirty = true;
        //                 form.do_onchange(ffield);
        //             });
        //         }
        //     });
        //     self.form_dialog.open();
        // });
    },
    do_save_event: function(event_id, event_obj) {
        var self = this,
            data = this.get_event_data(event_obj),
            index = this.dataset.get_id_index(event_id);
        if (index != null) {
            event_id = this.dataset.ids[index];
            this.dataset.write(event_id, data, {})
                .then(function() {
                    // self.refresh_minical();
                }, function() {
                    self.reload_event(event_id);
                });
        }
    },
    do_delete_event: function(event_id, event_obj) {
        // dhtmlx sends this event even when it does not exist in openerp.
        // Eg: use cancel in dhtmlx new event dialog
        var self = this,
            index = this.dataset.get_id_index(event_id);
        if (index !== null) {
            this.dataset.unlink(event_id, function() {
                self.refresh_minical();
            });
        }
    },
    do_edit_event: function(event_id, evt) {
        var self = this;
        var index = this.dataset.get_id_index(event_id);
        if (index !== null) {
            this.dataset.index = index;
            this.do_switch_view('page');
        } else if (scheduler.getState().mode === 'month') {
            var event_obj = scheduler.getEvent(event_id);
            if (event_obj._length === 1) {
                event_obj['start_date'].addHours(8);
                event_obj['end_date'] = new Date(event_obj['start_date']);
                event_obj['end_date'].addHours(1);
            } else {
                event_obj['start_date'].addHours(8);
                event_obj['end_date'].addHours(-4);
            }
            this.do_create_event_with_formdialog(event_id, event_obj);
            // return false;
            // Theorically, returning false should prevent the lightbox to open.
            // It works, but then the scheduler is in a buggy state where drag'n drop
            // related internal Event won't be fired anymore.
            // I tried scheduler.editStop(event_id); but doesn't work either
            // After losing one hour on this, here's a quick and very dirty fix :
            $(".dhx_cancel_btn").click();
        } else {
            scheduler.editStop($(evt.target).hasClass('icon_save'));
        }
    },
    refetchEvents: function() {
        this.$element && this.$element.fullcalendar('refetchEvents');
    },
    do_search: function(domain, context, group_by) {
        this.last_search = arguments;
        var __is_inited = true;
        var self = this;
        if (! _.isUndefined(this.event_source)) {
            try {
                this.$element.fullCalendar('removeEventSource', this.event_source);
            } catch(error) {
                this.init_calendar();
            }
        }
        this.event_source = {
            events: function(start, end, callback) {
                var current_event_source = self.event_source;
                var sidebar_items = {},
                    current_date = self.$element.fullCalendar('getDate'),
                    is_range_changed = self.is_view_changed(current_date);
                self.update_range_dates(current_date);
                var current_event_source = self.event_source;
                return self.dataset.read_slice(_.keys(self.fields), {
                    offset: 0,
                    domain: self.get_range_domain(domain, self.range_start, self.range_stop),
                    context: context,
                }).done(function(events) {
                     if (self.event_source !== current_event_source) {
                        console.log("Consecutive ``do_search`` called. Cancelling.");
                        return;
                    }
                    var evts = [];
                    for (var e = 0; e < events.length; e++) {
                        var evt = events[e];
                        if (!evt[self.date_start]) {
                            break;
                        }
                        if (self.color_field) {
                            var filter = evt[self.color_field];
                            if (filter) {
                                var filter_value = (typeof filter === 'object') ? filter[0] : filter;
                                if (self.selected_filters.length > 0
                                    && !_.any(self.selected_filters, function(sf) {
                                        return sf == evt[self.color_field];
                                    })
                                    )
                                {
                                    continue;
                                }
                                var filter_item = {
                                    value: filter_value,
                                    label: (typeof filter === 'object') ? filter[1] : filter,
                                    color: self.get_color(filter_value)
                                };
                                if (!sidebar_items[filter_value]) {
                                    sidebar_items[filter_value] = filter_item;
                                }
                                evt.color = filter_item.color;
                                evt.textColor = '#ffffff';
                            }
                        }

                        if (self.fields[self.date_start]['type'] == 'date') {
                            evt[self.date_start] = openerp.web.auto_str_to_date(evt[self.date_start]).set({hour: 9}).toString('yyyy-MM-dd HH:mm:ss');
                        }
                        if (self.date_stop && evt[self.date_stop] && self.fields[self.date_stop]['type'] == 'date') {
                            evt[self.date_stop] = openerp.web.auto_str_to_date(evt[self.date_stop]).set({hour: 17}).toString('yyyy-MM-dd HH:mm:ss');
                        }
                        evts.push(self.convert_event(evt));
                    }

                    if ((is_range_changed || typeof(__is_inited)!=="isUndefined")
                        && self.selected_filters.length == 0
                        && self.sidebar.responsible
                        || !self.dataset_events)
                         self.sidebar.responsible.on_events_loaded(sidebar_items);
                    self.dataset_events = evts;
                    return callback(evts);
                });
            },
            // eventDataTransform: function (event) {
            //     return self.event_data_transform(event);
            // },
        };
        this.$element.fullCalendar('addEventSource', self.event_source);
    },
    do_ranged_search: function() {
        var self = this;
        scheduler.clearAll();
        $.when(this.has_been_loaded, this.ready).then(function() {
            self.dataset.read_slice(_.keys(self.fields), {
                offset: 0,
                domain: self.get_range_domain(),
                context: self.last_search[1]
            }).then(function(events) {
                self.dataset_events = events;
                self.on_events_loaded(events);
            });
        });
    },
    get_range_domain: function(domain, start, end) {
        var format = openerp.web.date_to_str,
            domain = this.last_search[0].slice(0);
        domain.unshift([this.date_start, '>=', format(this.range_start.clone().addDays(-6))]);
        domain.unshift([this.date_start, '<=', format(this.range_stop.clone().addDays(6))]);
        return domain;
    },
    do_show: function () {
        var self = this;
        $.when(this.has_been_loaded).then(function() {
            self.$element.show();
            if (self.sidebar) {
                self.sidebar.$element.show();
            }
            self.do_push_state({});
        });
    },
    do_hide: function () {
        this._super();
        if (this.sidebar) {
            this.sidebar.$element.hide();
        }
    },
    get_selected_ids: function() {
        return this.selected_ids || [];
    }
});

openerp.web_calendar.CalendarFormDialog = openerp.web.Dialog.extend({
    init: function(view, options, view_id, dataset) {
        this._super(view, options);
        this.dataset = dataset;
        this.view_id = view_id;
        this.view = view;
    },
    start: function() {
        var self = this;
        this._super();
        this.form = new openerp.web.FormView(this, this.dataset, this.view_id, {
            sidebar: false,
            pager: false
        });
        this.form.appendTo(this.$element);
        this.form.on_created.add_last(this.on_form_dialog_saved);
        this.form.on_saved.add_last(this.on_form_dialog_saved);
        this.form.on_button_cancel = function() {
            self.close();
        }
    },
    on_form_dialog_saved: function() {
        var id = this.dataset.ids[this.dataset.index];
        if (this.view.creating_event_id) {
            scheduler.changeEventId(this.view.creating_event_id, id);
            this.view.creating_event_id = null;
        }
        this.view.reload_event(id);
        this.close();
    },
    on_close: function() {
        if (this.view.creating_event_id) {
            scheduler.deleteEvent(this.view.creating_event_id);
            this.view.creating_event_id = null;
        }
    }
});

openerp.web_calendar.SidebarResponsible = openerp.web.OldWidget.extend({
    // TODO: fme: in trunk, rename this class to SidebarFilter
    init: function(parent, view) {
        var $section = parent.add_section(view.color_string, 'responsible');
        this.$div = $('<div></div>');
        $section.append(this.$div);
        this._super(parent, $section.attr('id'));
        this.view = view;
        this.$element.delegate('input:checkbox', 'change', this.on_filter_click);
    },
    on_events_loaded: function(filters) {
        var selected_filters = this.view.selected_filters.slice(0);
        this.filters = filters;
        this.$div.html(QWeb.render('CalendarView.sidebar.responsible', { filters: filters }));
        this.$element.find('div.oe_calendar_responsible input').each(function() {
            if (_.indexOf(selected_filters, $(this).val()) > -1) {
                $(this).prop('checked','checked')
            }
        });
    },
    on_filter_click: function(e) {
        var self = this,
            responsibles = [],
            $e = $(e.target);
        this.view.selected_filters = [];
        this.$element.find('div.oe_calendar_responsible input:checked').each(function() {
            responsibles.push($(this).val());
            self.view.selected_filters.push($(this).val());
        });
        this.view.$element.fullCalendar('refetchEvents');
    }
});

openerp.web_calendar.SidebarNavigator = openerp.web.OldWidget.extend({
    init: function(parent, view) {
        var $section = parent.add_section(_t('Navigator'), 'navigator');
        this._super(parent, $section.attr('id'));
        this.view = view;
    },
    on_events_loaded: function(events) {
    }
});

// DEBUG_RPC:rpc.request:('execute', 'addons-dsh-l10n_us', 1, '*', ('ir.filters', 'get_filters', u'res.partner'))
// vim:et fdc=0 fdl=0 foldnestmax=3 fdm=syntax:
