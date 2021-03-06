openerp.web.form = {};

var _t = openerp.web._t,
   _lt = openerp.web._lt;
var QWeb = openerp.web.qweb;
    if (typeof(edited_tabs)=='undefined') {edited_tabs=[]}
openerp.web.views.add('form', 'openerp.web.FormView');
openerp.web.FormView = openerp.web.View.extend( /** @lends openerp.web.FormView# */{
    /**
     * Indicates that this view is not searchable, and thus that no search
     * view should be displayed (if there is one active).
     */
    searchable: false,
    readonly : false,
    form_template: "FormView",
    display_name: _lt('Form'),
    /**
     * @constructs openerp.web.FormView
     * @extends openerp.web.View
     *
     * @param {openerp.web.Session} session the current openerp session
     * @param {openerp.web.DataSet} dataset the dataset this view will work with
     * @param {String} view_id the identifier of the OpenERP view object
     * @param {Object} options
     *                  - sidebar : [true|false]
     *                  - resize_textareas : [true|false|max_height]
     *
     * @property {openerp.web.Registry} registry=openerp.web.form.widgets widgets registry for this form view instance
     */
    init: function(parent, dataset, view_id, options) {
        this._super(parent);
        this.set_default_options(options);
        this.dataset = dataset;
        this.model = dataset.model;
        this.view_id = view_id || false;
        this.fields_view = {};
        this.widgets = {};
        this.widgets_counter = 0;
        this.fields = {};
        this.fields_order = [];
        this.datarecord = {};
        this.default_focus_field = null;
        this.default_focus_button = null;
        this.registry = openerp.web.form.widgets;
        this.has_been_loaded = $.Deferred();
        this.$form_header = null;
        this.translatable_fields = [];
        _.defaults(this.options, {
            "not_interactible_on_create": false
        });
        this.is_initialized = $.Deferred();
        this.mutating_mutex = new $.Mutex();
        this.on_change_mutex = new $.Mutex();
        this.reload_mutex = new $.Mutex();

        this.__clicked_inside = false;
        this.__blur_timeout = null;
        window.onbeforeunload = function() {
            if (edited_tabs.length>0) {
            msgtoconfirm = 'You are about to reload this page! Data you have entered will NOT be saved! \n SAVE OR DISCARD CHANGES IN THESE TABS: \n';
            $.each(edited_tabs, function() {
                msgtoconfirm += "\n" + $('#tab_navigator li a[href='+this+']').html();
            })
            return msgtoconfirm;}
            return null;
        }
    },
    confirm_reload: function() {
        var listOfTabs = "";
        var edtab = $('#tab_navigator .ui-corner-top').find('a[href^="#"]').attr('href');
        var self = this;
        if (edited_tabs.length!==0) {
            $.each(edited_tabs, function() {
                var thisTab = $('#tab_navigator li > a[href='+this+']');
                    if (!thisTab.parent().hasClass("edited_tab") && self.$element.hasClass('oe_form_dirty')) {
                        thisTab.parent().addClass('edited_tab');
                    }
                    if ($('#tab_navigator li > a[href='+this+']').length==0
                    && (self.$element.parents()).find($('#tab_navigator .ui-state-active.edited_tab a[href='+this+']')).length==0) {
                        edited_tabs.splice(edited_tabs.indexOf(this),1);
                    }
                listOfTabs += "\n" + $('#tab_navigator li a[href='+this+']').html();
            });
        }
    },
    remove_from_confirm_reload: function() {
        var self = this,
            activeTab = $('#tab_navigator .ui-state-active').find('a[href^="#"]').attr('href'),
            edtab = $('#tab_navigator .edited_tab.ui-state-active').find('a[href^="#"]').attr('href') || (edited_tabs.indexOf(activeTab)>=0?activeTab:null);
        if (self.widget_parent!==null) {
        if (edtab &&
         (self.$element.hasClass('oe_form_dirty')==false && self.widget_parent.active_view=="form")) {
            $('#tab_navigator li > a[href='+edtab+']').parent().removeClass('edited_tab');
            edited_tabs.splice(edited_tabs.indexOf(edtab),1);
            this.confirm_reload();}
        }
    },
    start: function() {
        this._super();
        if (edited_tabs.length!==0) {this.confirm_reload()}
        var self = this;
        return this.init_view();
    },
    init_view: function() {
        var self = this;
        this.remove_from_confirm_reload();
        if (this.embedded_view) {
            var def = $.Deferred();
            def.then(this.on_loaded);
            var self = this;
            $.async_when().then(function() {def.resolve(self.embedded_view);});
            return def.promise();
        } else {
            var context = new openerp.web.CompoundContext(this.dataset.get_context());
            return this.rpc("/web/view/load", {
                "model": this.model,
                "view_id": this.view_id,
                "view_type": "form",
                toolbar: this.options.sidebar,
                context: context,
                action_id: self.widget_parent && self.widget_parent.action && self.widget_parent.action.id,
                }, this.on_loaded);
        }
    },
    stop: function() {
        if (this.sidebar) {
            this.sidebar.attachments.stop();
            this.sidebar.stop();
        }
        // _.each(this.widgets, function(w) {
        //     // $(w).unbind('.formBlur');
        //     w.stop();
        // });
        this.$element.unbind('.formBlur');
        if (this.$form_header && !!this.$form_header[0]) {
            this.$form_header[0].remove();
        }
        this.$form_header = null;
        delete this.$form_header;
        this._super();
    },
    reposition: function ($e) {
        this.$element = $e;
        this.on_loaded();
    },
    on_loaded: function(data) {
        var self = this;
        if (data) {
            this.fields_order = [];
            this.fields_view = data;
            var frame = new (this.registry.get_object('frame'))(this, this.fields_view.arch);

            var rendered = QWeb.render(this.form_template, { 'frame': frame, 'widget': this });
        }
        this.$element.html(rendered);
        this.$element.bind('mousedown.formBlur', function () {
            self.__clicked_inside = true;
        });
        _.each(this.widgets, function(w) {
            w.start();
            $(w).bind('widget-focus.formBlur', self.proxy('widgetFocused'))
                .bind('widget-blur.formBlur', self.proxy('widgetBlurred'));
        });
        this.$form_header = this.$element.find('.oe_form_header:first');
        this.$form_header.delegate('div.oe_form_pager button[data-pager-action]', 'click', function(e) {
            e.stopImmediatePropagation();
            var action = $(this).data('pager-action');
            self.on_pager_action(action);
        });
        this.$form_header.delegate('.oe_form_buttons button', 'click', function(e){
            self.on_button_click(e);
        });
        if (!this.sidebar && this.options.sidebar && this.options.sidebar_id) {
            this.sidebar = new openerp.web.Sidebar(this, this.options.sidebar_id);
            this.sidebar.start();
            this.sidebar.do_unfold();
            this.sidebar.attachments = new openerp.web.form.SidebarAttachments(this.sidebar, this);
            this.sidebar.add_toolbar(this.fields_view.toolbar);
            this.set_common_sidebar_sections(this.sidebar);
        }
        this.has_been_loaded.resolve();
    },
    on_button_click: function(e) {
        var fctname = $(e.currentTarget).data('action');
        if (!fctname) return;
        return this[fctname]();
    },
    widgetFocused: function() {
        // Clear click flag if used to focus a widget
        this.__clicked_inside = false;
        if (this.__blur_timeout) {
            clearTimeout(this.__blur_timeout);
            this.__blur_timeout = null;
        }
    },
    widgetBlurred: function() {
        if (this.__clicked_inside) {
            // clicked in an other section of the form (than the currently
            // focused widget) => just ignore the blurring entirely?
            this.__clicked_inside = false;
            return;
        }
        var self = this;
        // clear timeout, if any
        this.widgetFocused();
        this.__blur_timeout = setTimeout(function () {
            $(self).trigger('form-blur');
        }, 0);
    },

    do_load_state: function(state, warm) {
        if (state.id && this.datarecord.id != state.id) {
            if (!this.dataset.get_id_index(state.id)) {
                this.dataset.ids.push(state.id);
            }
            this.dataset.select_id(state.id);
            if (warm) {
                this.do_show();
            }
        }
    },

    do_show: function () {
        var self = this;
        this.$element.show().css('visibility', 'hidden');
        this.$element.removeClass('oe_form_dirty');
        self.confirm_reload();
        return this.has_been_loaded.then(self.shift_dataset_index());
    },
    shift_dataset_index: function() {
        var result;
        var self = this;
        if (self.dataset.index === null) {
            // null index means we should start a new record
            result = self.on_button_new();
        } else {
            result = self.dataset.read_index(_.keys(self.fields_view.fields), {
                context : { 'bin_size' : true }
            }).then(
            function(res){
                var d = new $.Deferred();
                self.on_record_loaded(res).done(function(){
                    self.forbid_focus_default = null;
                    d.resolve()
                });
                return d;
            })
        }
        result.then(function() {
            self.$element.css('visibility', 'visible');
        });
        if (self.sidebar) {
            self.sidebar.$element.show();
        }
        return result;
    },
    do_hide: function () {
        this.$element.removeClass('oe_form_dirty');
        this.remove_from_confirm_reload();
        this._super();
        if (this.sidebar) {
            this.sidebar.$element.hide();
        }
    },
    undirty_form: function() {
        this.$element
            .removeClass('oe_form_dirty')
            .find('.invalid').removeClass('invalid');
    },
    do_focus_default_field: function() {
        var self = this;
        if (!!self.default_focus_field && !self.forbid_focus_default) {
            self.default_focus_field && self.default_focus_field.focus();
        }
    },
    on_record_loaded: function(record) {
        var self = this, set_values = [];
        if (!record) {
            this.do_warn(_t("Form"), _t("The record could not be found in the database."), true);
            return $.Deferred().promise()
        }
        this.datarecord = record;
        _(self.fields).each(function (field, f) {
            field.reset();
            var result = field.set_value(self.datarecord[f] || false);
            set_values.push(result);
            $.when(result).done(function() {
                field.validate();
            });
        });
        return $.when.apply(null,set_values).then(function() {
            if (self.dataset.index === null) {
                // New record: Second pass in order to trigger the onchanges
                // respecting the fields order defined in the view
                _.each(self.fields_order, function(field_name) {
                    if (record[field_name] !== undefined) {
                        var field = self.fields[field_name];
                        field.dirty = false;
                        self.do_onchange(field);
                    }
                });
            }
            self.on_form_changed();
            self.is_initialized.resolve();
            self.do_update_pager(record.id == null);
            if (self.sidebar) {
                self.sidebar.attachments.do_update();
            }
            self.do_focus_default_field();
            if (record.id) {
                self.do_push_state({id:record.id});
            }
            self.undirty_form();
            self.remove_from_confirm_reload();
            self.do_update_id_holder();
        });
    },
    on_form_changed: function() {
        _.each(this.widget_children, function(child) {
            if (child.field) {
                child.validate();
            }
            if (child.update_dom) {
                child.update_dom();
            }
        });
    },
    do_notify_change: function() {
        this.confirm_reload();
        this.$element.addClass('oe_form_dirty');
    },
    on_pager_action: function(action) {
        if (this.can_be_discarded()) {
            switch (action) {
                case 'first':
                    this.dataset.index = 0;
                    break;
                case 'previous':
                    this.dataset.previous();
                    break;
                case 'next':
                    this.dataset.next();
                    break;
                case 'last':
                    this.dataset.index = this.dataset.ids.length - 1;
                    break;
            }
            this.reload();
        }
    },
    do_update_pager: function(hide_index) {
        var $pager = this.$form_header.find('div.oe_form_pager');
        var index = hide_index ? '-' : this.dataset.index + 1;
        $pager.find('button').prop('disabled', this.dataset.ids.length < 2);
        $pager.find('span.oe_pager_index').html(index);
        $pager.find('span.oe_pager_count').html(this.dataset.ids.length);
    },
    do_update_id_holder: function() {
        current_id = this.dataset.index != undefined && this.dataset.ids[this.dataset.index] || 'n/a'
        this.$form_header.find('.oe_object_id').html(current_id);
    },
    parse_on_change: function (on_change, widget) {
        var self = this;
        var onchange = _.str.trim(on_change);
        var call = onchange.match(/^\s?(.*?)\((.*?)\)\s?$/);
        if (!call) {
            return null;
        }

        var method = call[1];
        if (!_.str.trim(call[2])) {
            return {method: method, args: [], context_index: null}
        }

        var argument_replacement = {
            'False': function () {return false;},
            'True': function () {return true;},
            'None': function () {return null;},
            'context': function (i) {
                context_index = i;
                var ctx = new openerp.web.CompoundContext(self.dataset.get_context(), widget.build_context() ? widget.build_context() : {});
                return ctx;
            }
        };
        var parent_fields = null, context_index = null;
        var args = _.map(call[2].split(','), function (a, i) {
            var field = _.str.trim(a);

            // literal constant or context
            if (field in argument_replacement) {
                return argument_replacement[field](i);
            }
            // literal number
            if (/^-?\d+(\.\d+)?$/.test(field)) {
                return Number(field);
            }
            // form field
            if (self.fields[field]) {
                var value = self.fields[field].get_on_change_value();
                return value == null ? false : value;
            }
            // parent field
            var splitted = field.split('.');
            if (splitted.length > 1 && _.str.trim(splitted[0]) === "parent" && self.dataset.parent_view) {
                if (parent_fields === null) {
                    parent_fields = self.dataset.parent_view.get_fields_values([self.dataset.child_name]);
                }
                var p_val = parent_fields[_.str.trim(splitted[1])];
                if (p_val !== undefined) {
                    return p_val == null ? false : p_val;
                }
            }
            // string literal
            var first_char = field[0], last_char = field[field.length-1];
            if ((first_char === '"' && last_char === '"')
                || (first_char === "'" && last_char === "'")) {
                return field.slice(1, -1);
            }

            throw new Error("Could not get field with name '" + field +
                            "' for onchange '" + onchange + "'");
        });

        return {
            method: method,
            args: args,
            context_index: context_index
        };
    },
    do_onchange: function(widget, processed) {
        var self = this;
        return this.on_change_mutex.exec(function() {
            var response = {}, can_process_onchange = new $.Deferred();
            processed = processed || [];
            processed.push(widget.name);
            var on_change = widget.node.attrs.on_change;
            if (on_change) {
                var change_spec = self.parse_on_change(on_change, widget);
                if (change_spec) {
                    var ajax = {
                        url: '/web/dataset/onchange',
                        async: false
                    };
                    can_process_onchange = self.rpc(ajax, {
                        model: self.dataset.model,
                        method: change_spec.method,
                        args: [(self.datarecord.id == null ? [] : [self.datarecord.id])].concat(change_spec.args),
                        context_id: change_spec.context_index == undefined ? null : change_spec.context_index + 1
                    }).then(function(r) {
                        _.extend(response, r);
                    });
                } else {
                    console.warn("Wrong on_change format", on_change);
                }
            }
            // fail if onchange failed
            if (can_process_onchange.state()==='rejected') {
                return can_process_onchange;
            }

            if (widget.field['change_default']) {
                var fieldname = widget.name, value;
                if (response.value && (fieldname in response.value)) {
                    // Use value from onchange if onchange executed
                    value = response.value[fieldname];
                } else {
                    // otherwise get form value for field
                    value = self.fields[fieldname].get_on_change_value();
                }
                var condition = fieldname + '=' + value;

                if (value) {
                    can_process_onchange = new $.Deferred();
                    can_process_onchange = self.rpc({
                        url: '/web/dataset/call',
                        async: false
                    }, {
                        model: 'ir.values',
                        method: 'get_defaults',
                        args: [self.model, condition]
                    }).then(function (results) {
                        if (!results.length) { return; }
                        if (!response.value) {
                            response.value = {};
                        }
                        for(var i=0; i<results.length; ++i) {
                            // [whatever, key, value]
                            var triplet = results[i];
                            response.value[triplet[1]] = triplet[2];
                        }
                    });
                }
            }
            if (can_process_onchange.state()=='rejected') {
                return can_process_onchange;
            }

            return self.on_processed_onchange(response, processed, widget);
        });
    },
    on_processed_onchange: function(response, processed, widget) {
        var self = this;
        try {
        var result = response;
        if (result.value) {
            for (var f in result.value) {
                if (!result.value.hasOwnProperty(f)) { continue; }
                var field = this.fields[f];
                // If field is not defined in the view, just ignore it
                if (field) {
                    var value = result.value[f];
                    if (field.get_value() != value) {
                        field.set_value(value);
                        field.dirty = true;
                        if (!_.contains(processed, field.name)) {
                            this.do_onchange(field, processed);
                        }
                    }
                }
            }
            this.on_form_changed();
        }
        if (!_.isEmpty(result.warning)) {
            $(QWeb.render("CrashManagerWarning", result.warning)).dialog({
                modal: true,
                buttons:[{ text: _t("Ok"), click: function() { $(this).dialog("close"); }, } ],
                close: function(event, ui) { widget.focus() },
            });
        }
        if (result.domain) {
            function edit_domain(node) {
                var new_domain = result.domain[node.attrs.name];
                if (new_domain) {
                    node.attrs.domain = new_domain;
                }
                _(node.children).each(edit_domain);
            }
            edit_domain(this.fields_view.arch);
        }
        return $.Deferred().resolve();
        } catch(e) {
            console.error(e);
            return $.Deferred().reject();
        }
    },
    on_button_create: function() {
        var self= this;
        this.checked_unsaved_def = $.Deferred();
        this.checked_unsaved_def.done(function(){
            self.dataset.index = null;
            self.dataset.context = _.extend(self.dataset.context, {
                active_id: null,
                active_ids: [],
                active_model: self.dataset.model
            });
        })
        this.previous_index = this.dataset.index;
        this.do_switch_view('form');
    },
    on_button_duplicate: function() {
        var self = this;
        var def = $.Deferred();
        $.when(this.has_been_loaded).then(function() {
            if (self.is_dirty() && confirm(_t("There is unsaved data, you will lose all the changes.\nDo you really want to continue?")) || !self.is_dirty())
            self.dataset.call('copy', [self.datarecord.id, {}, self.dataset.context]).then(function(new_id) {
                self.widget_parent.dataset.duplicate_allow = true;
                return self.on_created({ result : new_id });
            }).then(function() {
                return self.do_switch_view('form');
            }).then(function() {
                def.resolve();
            });
        });
        return def.promise();
    },
    on_button_delete: function() {
        var self = this;
        var def = $.Deferred();
        $.when(this.has_been_loaded).then(function() {
            if (self.datarecord.id && confirm(_t("Do you really want to delete this record?"))) {
                self.dataset.unlink([self.datarecord.id]).then(function() {
                    self.on_pager_action('next');
                    def.resolve();
                });
            } else {
                $.async_when().then(function () {
                    def.reject();
                })
            }
        });
        return def.promise();
    },
    on_button_save: function() {
        var self = this,
            __views = this.widget_parent.views;
        if (__views && __views.list && __views.list.controller != null) {
            __views.list.controller.stop();
            __views.list.controller = null;
        }
        return this.do_save()
    },
    on_button_cancel: function() {
        if (this.can_be_discarded()) {
            return this.do_prev_view({'default': 'page'});
        }
    },
    on_button_new: function() {
        var self = this;
        var def = new $.Deferred();
        $.when(self.has_been_loaded).then(function() {
            if (self.can_be_discarded()) {
                var keys = _.keys(self.fields_view.fields);
                if (keys.length) {
                    self.dataset.default_get(keys).then(function(res){
                        return self.on_record_loaded(res);
                    }).then(function() {
                        def.resolve();
                    });
                } else {
                    self.on_record_loaded({}).then(function() {
                        def.resolve();
                    });
                }
                def.done(function(){
                    self.dataset.index = null;
                });
            }
        });
        return def.promise();
    },
    can_be_discarded: function() {
        return !this.$element.is('.oe_form_dirty') || confirm(_t("Warning, the record has been modified, your changes will be discarded."));
    },
    /**
     * Triggers saving the form's record. Chooses between creating a new
     * record or saving an existing one depending on whether the record
     * already has an id property.
     *
     * @param {Function} [success] callback on save success
     * @param {Boolean} [prepend_on_create=false] if ``do_save`` creates a new record, should that record be inserted at the start of the dataset (by default, records are added at the end)
     */
    get_tab_page: function(field) {
        var tab_page = null;
        if (field.widget_parent.type === 'page' && field.widget_parent.element_id
            && field.view && field.view.$element
            && field.widget_parent.$element_tab && field.widget_parent.$element_tab.length
            )
            tab_page = field.widget_parent;
        return tab_page;
    },
    do_save: function(success, prepend_on_create) {
        var self = this;
        return this.mutating_mutex.exec(function() {return self.is_initialized.then(function() {
            //try {
            var form_invalid = false,
                values = {},
                first_invalid_field = null;
            for (var f in self.fields) {
                f = self.fields[f];
                if (!f.is_valid()) {
                    form_invalid = true;
                    if (!first_invalid_field) {
                        first_invalid_field = f;
                    }
                } else if (f.name !== 'id' && (!f.is_readonly() || f.soft_readonly) && (!self.datarecord.id || f.is_dirty())) {
                    // Special case 'id' field, do not save this field
                    // on 'create' : save all non readonly fields
                    // on 'edit' : save non readonly modified fields
                    values[f.name] = f.get_value();
                    var tab_page = self.get_tab_page(f);
                    if (
                        tab_page && f.view && f.view.$element
                        && !f.view.$element.find('#'+tab_page.element_id).find('.invalid').length
                    )
                        tab_page.$element_tab.removeClass('ea_invalid_tab');
                }
                f.update_dom(true);
            }
            if (form_invalid) {
                first_invalid_field.focus();
                self.on_invalid();
                return $.Deferred().reject();
            } else {
                self.$element.find('.ea_invalid_tab').removeClass('ea_invalid_tab');
                var save_deferral;
                if (!self.datarecord.id) {
                    save_deferral = new $.Deferred();
                    self.dataset.create(values).then(function(r) {
                        return self.on_created(r, undefined, prepend_on_create).then(function(created) {
                            return save_deferral.resolve(created);
                    })
                    }, function(res){ return save_deferral.reject(); });
                } else if (_.isEmpty(values) && ! self.force_dirty) {
                    save_deferral = $.Deferred().resolve({}).promise();
                } else {
                    self.force_dirty = false;
                    save_deferral = self.dataset.write(self.datarecord.id, values, {}).then(function(r) {
                        return self.on_saved(r);
                    }, null);
                }
                return save_deferral.done(success);
            }
        });
        });
    },
    is_valid: function() {
        var self = this;
        for (var f in self.fields) {
            f = self.fields[f];
            if (!f.is_valid()) {
                return false;
            }
        }
        return true;
    },
    is_readonly: function() {
        return this.readonly || ((typeof(this.widget_parent.is_readonly)!=='undefined') && this.widget_parent.is_readonly());
    },
    on_invalid: function() {
        var self = this;
        var msg = "<ul>";
        _.each(this.fields, function(f) {
            if (!f.is_valid()) {
                msg += "<li>" + f.string + "</li>";
                var tab_page = self.get_tab_page(f);
                tab_page && tab_page.$element_tab.addClass('ea_invalid_tab');
            }
        });
        msg += "</ul>";
        this.do_warn(_t("The following fields are invalid :"), msg);
    },
    on_saved: function(r, success) {
        if (!r.result) {
            // should not happen in the server, but may happen for internal purpose
            return $.Deferred().reject();
        } else {
            return this.reload().then(function () {
                return r; })
                    .then(success);
        }
    },
    /**
     * Updates the form' dataset to contain the new record:
     *
     * * Adds the newly created record to the current dataset (at the end by
     *   default)
     * * Selects that record (sets the dataset's index to point to the new
     *   record's id).
     * * Updates the pager and sidebar displays
     *
     * @param {Object} r
     * @param {Function} success callback to execute after having updated the dataset
     * @param {Boolean} [prepend_on_create=false] adds the newly created record at the beginning of the dataset instead of the end
     */
    on_created: function(r, success, prepend_on_create) {
        if (!r.result) {
            // should not happen in the server, but may happen for internal purpose
            return $.Deferred().reject();
        } else {
            this.datarecord.id = r.result;
            if (!prepend_on_create) {
                this.dataset.alter_ids(this.dataset.ids.concat([this.datarecord.id]));
                this.dataset.index = this.dataset.ids.length - 1;
            } else {
                this.dataset.alter_ids([this.datarecord.id].concat(this.dataset.ids));
                this.dataset.index = 0;
            }
            this.do_update_pager();
            if (this.sidebar) {
                this.sidebar.attachments.do_update();
            }
            //openerp.log("The record has been created with id #" + this.datarecord.id);
            return this.reload().then(function () {
                return _.extend(r, {created: true}); })
                    .then(success);
        }
    },
    on_action: function (action) {
        console.debug('Executing action', action);
    },
    reload: function() {
        var self = this;
        var reload_def = new $.Deferred();
        return this.reload_mutex.exec(function() {
            if (self.dataset.index == null || self.dataset.index < 0) {
                return self.on_button_new();
            } else {
                 return self.dataset.read_index(_.keys(self.fields_view.fields), {
                     context : { 'bin_size' : true }
                }).then(function(result){
                    return self.on_record_loaded(result);
                });
            }
        });
    },
    get_fields_values: function(blacklist) {
        blacklist = blacklist || [];
        var values = {};
        var ids = this.get_selected_ids();
        values["id"] = ids.length > 0 ? ids[0] : false;
        _.each(this.fields, function(value, key) {
            if (_.include(blacklist, key))
                return;
            var val = value.get_value();
            values[key] = val;
        });
        return values;
    },
    get_selected_ids: function() {
        var id = this.dataset.ids[this.dataset.index];
        return id ? [id] : [];
    },
    recursive_save: function() {
        var self = this;
        return $.when( this.do_save(), self.dataset.parent_view && self.dataset.parent_view.recursive_save() || true).done(function() {
                    if (self.dataset.parent_view && self.dataset.parent_view.fields[self.dataset.child_name]) {
                        self.dataset = self.dataset.parent_view.fields[self.dataset.child_name].dataset;
                    }
                });
    },
    is_dirty: function() {
        return _.any(this.fields, function (value) {
            return value.is_dirty();
        });
    },
    is_interactible_record: function() {
        var id = this.datarecord.id;
        if (!id) {
            if (this.options.not_interactible_on_create)
                return false;
        } else if (typeof(id) === "string") {
            if(openerp.web.BufferedDataSet.virtual_id_regex.test(id))
                return false;
        }
        return true;
    },
    sidebar_context: function () {
        return this.do_save().then(_.bind(function() {return this.get_fields_values();}, this));
    }
});
openerp.web.FormDialog = openerp.web.Dialog.extend({
    init: function(parent, options, view_id, dataset) {
        this._super(parent, options);
        this.dataset = dataset;
        this.view_id = view_id;
        return this;
    },
    start: function() {
        this._super();
        this.form = new openerp.web.FormView(this, this.dataset, this.view_id, {
            sidebar: false,
            pager: false
        });
        this.form.appendTo(this.$element);
        this.form.on_created.add_last(this.on_form_dialog_saved);
        this.form.on_saved.add_last(this.on_form_dialog_saved);
        return this;
    },
    select_id: function(id) {
        if (this.form.dataset.select_id(id)) {
            return this.form.do_show();
        } else {
            this.do_warn(_t("Could not find id in dataset"));
            return $.Deferred().reject();
        }
    },
    on_form_dialog_saved: function(r) {
        this.close();
    }
});

/** @namespace */
openerp.web.form = {};

openerp.web.form.SidebarAttachments = openerp.web.OldWidget.extend({
    init: function(parent, form_view) {
        var $section = parent.add_section(_t('Attachments'), 'attachments');
        this.$div = $('<div class="oe-sidebar-attachments"></div>');
        $section.append(this.$div);

        this._super(parent, $section.attr('id'));
        this.view = form_view;
        this.attachment_title = function (name) {
            return _.str.sprintf(_t("Delete the attachment %s"), name);
        };
    },
    stop: function() {
        if (this.$div && this.$div[0]) this.$div[0].remove();
        this.$div = null; delete this.$div;
        this._super();
    },
    do_update: function() {
        if (!this.view.datarecord.id) {
            this.on_attachments_loaded([]);
        } else {
            (new openerp.web.DataSetSearch(
                this, 'ir.attachment', this.view.dataset.get_context(),
                [
                    ['res_model', '=', this.view.dataset.model],
                    ['res_id', '=', this.view.datarecord.id],
                    ['type', 'in', ['binary', 'url']]
                ])).read_slice(['name', 'url', 'type'], {}).then(this.on_attachments_loaded);
        }
    },
    process_modifiers: function() {
    },
    on_attachments_loaded: function(attachments) {
        var self = this;
        this.attachments = attachments;
        this.$div.html(QWeb.render('FormView.sidebar.attachments', this));
        this.$element.on('change', '.oe-binary-file', function(e) {
            e.stopImmediatePropagation();
            return self.on_attachment_changed(e);
        });
        this.$element.on('click','.oe-sidebar-attachment-delete', function(e){
            return self.on_attachment_delete(e);
        });
    },
    on_attachment_changed: function(e) {
        window[this.element_id + '_iframe'] = this.do_update;
        var $e = $(e.target);
        if ($e.val() != '') {
            this.$element.find('form.oe-binary-form').submit();
            $e.parent().find('input[type=file]').prop('disabled', true);
            $e.parent().find('button').prop('disabled', true).find('img, span').toggle();
        }
    },
    on_attachment_delete: function(e) {
        e.stopImmediatePropagation();
        var self = this, $e = $(e.currentTarget);
        var name = _.str.trim($e.parent().find('a.oe-sidebar-attachments-link').text());
        if (confirm(_.str.sprintf(_t("Do you really want to delete the attachment %s?"), name))) {
            this.rpc('/web/dataset/unlink', {
                model: 'ir.attachment',
                ids: [parseInt($e.attr('data-id'))]
            }, function(r) {
                $e.parent().remove();
                self.do_update();
                self.do_notify(
                    _t("Delete an attachment"),
                    _.str.sprintf(_t("The attachment '%s' has been deleted"), name));
            });
        }
    }
});

openerp.web.form.compute_domain = function(expr, fields) {
    var stack = [];
    for (var i = expr.length - 1; i >= 0; i--) {
        var ex = expr[i];
        if (ex.length == 1) {
            var top = stack.pop();
            switch (ex) {
                case '|':
                    stack.push(stack.pop() || top);
                    continue;
                case '&':
                    stack.push(stack.pop() && top);
                    continue;
                case '!':
                    stack.push(!top);
                    continue;
                default:
                    throw new Error(_.str.sprintf(
                        _t("Unknown operator %s in domain %s"),
                        ex, JSON.stringify(expr)));
            }
        }

        var field = fields[ex[0]];
        if (!field) {
            throw new Error(_.str.sprintf(
                _t("Unknown field %s in domain %s"),
                ex[0], JSON.stringify(expr)));
        }
        var field_value = field.get_value ? fields[ex[0]].get_value() : fields[ex[0]].value;
        field_value =  _.isArray(field_value) && field_value.length != 0 ? field_value[0] : field_value;
        var op = ex[1];
        var val = ex[2];
        switch (op.toLowerCase()) {
            case '=':
            case '==':
                stack.push(field_value == val);
                break;
            case '!=':
            case '<>':
                stack.push(field_value != val);
                break;
            case '<':
                stack.push(field_value < val);
                break;
            case '>':
                stack.push(field_value > val);
                break;
            case '<=':
                stack.push(field_value <= val);
                break;
            case '>=':
                stack.push(field_value >= val);
                break;
            case 'in':
                if (!_.isArray(val)) val = [val];
                stack.push(_(val).contains(field_value));
                break;
            case 'not in':
                if (!_.isArray(val)) val = [val];
                stack.push(!_(val).contains(field_value));
                break;
            default:
                console.warn(
                    _t("Unsupported operator %s in domain %s"),
                    op, JSON.stringify(expr));
        }
    }
    return _.all(stack, _.identity);
};

openerp.web.form.Widget = openerp.web.OldWidget.extend(/** @lends openerp.web.form.Widget# */{
    template: 'Widget',
    /**
     * @constructs openerp.web.form.Widget
     * @extends openerp.web.OldWidget
     *
     * @param view
     * @param node
     */
    init: function(view, node) {
        this.view = view;
        _.defaults(node.attrs, {context: {}});
        _.defaults(node.attrs.context, {own_values: {}});
        node.attrs.context.own_values._onchange_field = node.attrs.name;
        this.node = node;
        this.modifiers = JSON.parse(this.node.attrs.modifiers || '{}');
        this.always_invisible = (this.modifiers.invisible && this.modifiers.invisible === true);
        this.type = this.type || node.tag;
        this.element_name = this.element_name || this.type;
        this.element_class = [
            'formview', this.view.view_id, this.element_name,
            this.view.widgets_counter++].join("_");

        this._super(view);

        this.view.widgets[this.element_class] = this;
        this.children = node.children;
        this.colspan = parseInt(node.attrs.colspan || 1, 10);
        this.decrease_max_width = 0;

        this.string = this.string || node.attrs.string;
        this.help = this.help || node.attrs.help;
        this.invisible = this.modifiers['invisible'] === true;
        this.classname = 'oe_form_' + this.type;

        this.align = parseFloat(this.node.attrs.align);
        if (isNaN(this.align) || this.align === 1) {
            this.align = 'right';
        } else if (this.align === 0) {
            this.align = 'left';
        } else {
            this.align = 'center';
        }


        this.width = this.node.attrs.width;
        this.widget_parent = view;
        view.widget_children.push(this);
    },
    /**
     * Sets up blur/focus forwarding from DOM elements to a widget (`this`)
     *
     * @param {jQuery} $e jQuery object of elements to bind focus/blur on
     */
    setupFocus: function ($e) {
        var self = this;
        $e.bind({
            focus: function () { $(self).trigger('widget-focus'); },
            blur: function () { $(self).trigger('widget-blur'); }
        });
    },
    start: function() {
        this.$element = this.view.$element.find(
            '.' + this.element_class.replace(/[^\r\n\f0-9A-Za-z_-]/g, "\\$&"));
    },
    stop: function() {
        this._super.apply(this, arguments);
        $.fn.tipsy.clear();
    },
    process_modifiers: function() {
        var compute_domain = openerp.web.form.compute_domain;
        for (var a in this.modifiers) {
            this[a] = compute_domain(this.modifiers[a], this.view.fields);
        };
    },
    is_readonly: function() {
        return this.readonly || (this.widget_parent && typeof(this.widget_parent.is_readonly)!=='undefined' && this.widget_parent.is_readonly());
    },
    update_dom: function() {
        var self = this;
        this.process_modifiers();
        _.each(self.widget_children, function(child) {
            if (child.update_dom) {
                child.update_dom();
            }
        });
        if ( this.$element[0] ) {
            if ( this.invisible ) {
                this.$element[0].style.display = 'none';
            } else {
                this.$element[0].style.display = '';
            }
        }
    },
    render: function() {
        var template = this.template;
        return QWeb.render(template, { "widget": this });
    },
    do_attach_tooltip: function(widget, trigger, options) {
        widget = widget || this;
        trigger = trigger || this.$element;
        options = _.extend({
                delayIn: 500,
                delayOut: 0,
                fade: true,
                title: function() {
                    var template = widget.template + '.tooltip';
                    if (!QWeb.has_template(template)) {
                        template = 'WidgetLabel.tooltip';
                    }
                    return QWeb.render(template, {
                        debug: openerp.connection.debug,
                        widget: widget
                })},
                gravity: $.fn.tipsy.autoBounds(50, 'nw'),
                html: true,
                opacity: 0.85,
                trigger: 'hover'
            }, options || {});
        trigger.tipsy(options);
    },
    _build_view_fields_values: function(blacklist) {
        var a_dataset = this.view.dataset;
        var fields_values = this.view.get_fields_values(blacklist);
        var active_id = a_dataset.ids[a_dataset.index];
        _.extend(fields_values, {
            active_id: active_id || false,
            active_ids: active_id ? [active_id] : [],
            active_model: a_dataset.model,
            parent: {}
        });
        if (a_dataset.parent_view) {
            fields_values.parent = a_dataset.parent_view.get_fields_values([a_dataset.child_name]);
        }
        return fields_values;
    },
    _build_eval_context: function(blacklist) {
        var a_dataset = this.view.dataset;
        return new openerp.web.CompoundContext(a_dataset.get_context(), this._build_view_fields_values(blacklist));
    },
    /**
     * Builds a new context usable for operations related to fields by merging
     * the fields'context with the action's context.
     */
    build_context: function(blacklist) {
        // only use the model's context if there is not context on the node
        var v_context = this.node.attrs.context;
        if (! v_context) {
            v_context = (this.field || {}).context || {};
        }
        if (v_context.__ref || true) { //TODO: remove true
            var fields_values = this._build_eval_context(blacklist);
            v_context = new openerp.web.CompoundContext(v_context).set_eval_context(fields_values);
        }
        var active_id, active_ids, active_model;
        for (i in v_context.__eval_context.__contexts) { //TODO: remove this and fix CompoundContext
            active_id = active_id || v_context.__eval_context.__contexts[i].active_id;
            active_ids = active_ids || v_context.__eval_context.__contexts[i].active_ids;
            active_model = active_model || v_context.__eval_context.__contexts[i].active_model;
        }
        for (i in v_context.__eval_context.__contexts) {
            v_context.__eval_context.__contexts[i].active_id = active_id;
            v_context.__eval_context.__contexts[i].active_ids = active_ids;
            v_context.__eval_context.__contexts[i].active_model = active_model;
        }
        return v_context;
    },
    build_domain: function() {
        var f_domain = this.field.domain || [];
        var n_domain = this.node.attrs.domain || null;
        // if there is a domain on the node, overrides the model's domain
        var final_domain = n_domain !== null ? n_domain : f_domain;
        if (!(final_domain instanceof Array) || true) { //TODO: remove true
            var fields_values = this._build_eval_context();
            final_domain = new openerp.web.CompoundDomain(final_domain).set_eval_context(fields_values);
        }
        return final_domain;
    }
});

openerp.web.form.WidgetFrame = openerp.web.form.Widget.extend({
    template: 'WidgetFrame',
    init: function(view, node) {
        this._super(view, node);
        this.columns = parseInt(node.attrs.col || 4, 10);
        this.x = 0;
        this.y = 0;
        this.table = [];
        this.add_row();
        for (var i = 0; i < node.children.length; i++) {
            var n = node.children[i];
            if (n.tag == "newline") {
                this.add_row();
            } else {
                this.handle_node(n);
            }
        }
        this.set_row_cells_with(this.table[this.table.length - 1]);
    },
    add_row: function(){
        if (this.table.length) {
            this.set_row_cells_with(this.table[this.table.length - 1]);
        }
        var row = [];
        this.table.push(row);
        this.x = 0;
        this.y += 1;
        return row;
    },
    set_row_cells_with: function(row) {
        var total_colspan = 0;
        var bypass = 0,
            max_width = 100,
            row_length = row.length;
        var self = this;
        for (var i = 0; i < row.length; i++) {
            if (row[i].always_invisible || row[i].invisible ) {
                row_length--;
            } else {
                bypass += row[i].width === undefined ? 0 : 1;
                max_width -= row[i].decrease_max_width;
            }
        }
        var size_unit = Math.round(max_width / (this.columns - bypass)),
            colspan_sum = 0;
        for (var i = 0; i < row.length; i++) {
            var w = row[i];
            if (w.always_invisible || w.invisible) {
                continue;
            }
            colspan_sum += w.colspan;
            if (w.width === undefined) {
                // var width, _label_width = 0;
                // if (w.$element) {
                //     var _label = _.find(row,function(r){
                //         return r.for===w;
                //     });
                //     _label_width = _label ? parseFloat(_label.width.substring(0,_label.width.indexOf('%'))) : 0;
                //     width = ((i === row_length - 1 && colspan_sum === this.columns || row.length==1) ? max_width - _label_width: Math.round(size_unit * w.colspan) - _label_width);
                // } else {
                    // width = Math.min((row.length==1) ? max_width : Math.round(size_unit * w.colspan) -_label_width,100-_label_width);
                // }
                // max_width -= (width + _label_width);
                var width = (i === row_length - 1 && colspan_sum === this.columns) ? max_width : Math.round(size_unit * w.colspan);
                max_width -= width;
                w.width = width + '%';
            }
        }
    },
    handle_node: function(node) {
        var self = this;
        var type = {};
        if (node.tag == 'field') {
            type = this.view.fields_view.fields[node.attrs.name] || {};
            if (node.attrs.widget == 'statusbar' && node.attrs.nolabel !== '1') {
                // This way we can retain backward compatibility between addons and old clients
                node.attrs.colspan = (parseInt(node.attrs.colspan, 10) || 1) + 1;
                node.attrs.nolabel = '1';
            }
        }
        var widget = new (this.view.registry.get_any(
                [node.attrs.widget, type.type, node.tag])) (this.view, node);
        if (node.tag == 'field') {
            if (!this.view.default_focus_field && node.attrs.invisible != true || node.attrs.default_focus == true) {
                this.view.default_focus_field = widget;
            }
            if (node.attrs.nolabel != '1') {
                var label = new (this.view.registry.get_object('label')) (this.view, node);
                label["for"] = widget;
                this.add_widget(label, widget.colspan + 1);
            }
        }
        widget.widget_parent = self;
        self.widget_children.push(widget);
        this.add_widget(widget);
    },
    add_widget: function(widget, colspan) {
        var current_row = this.table[this.table.length - 1];
        if (!widget.always_invisible) {
            colspan = colspan || widget.colspan;
            if (current_row.length && (this.x + colspan) > this.columns) {
                current_row = this.add_row();
            }
            this.x += widget.colspan;
        }
        current_row.push(widget);
        return widget;
    },
});

openerp.web.form.WidgetGroup = openerp.web.form.WidgetFrame.extend({
    template: 'WidgetGroup'
}),

openerp.web.form.WidgetNotebook = openerp.web.form.Widget.extend({
    template: 'WidgetNotebook',
    init: function(view, node) {
        this._super(view, node);
        this.pages = [];
        for (var i = 0; i < node.children.length; i++) {
            var n = node.children[i];
            if (n.tag == "page") {
                var page = new (this.view.registry.get_object('notebookpage'))(
                        this.view, n, this, this.pages.length);
                this.pages.push(page);
                this.widget_children.push(page);
            }
        }
    },
    start: function() {
        var self = this;
        this._super.apply(this, arguments);
        this.$element.find('> ul > li').each(function (index, tab_li) {
            var page = self.pages[index],
                id = _.uniqueId(self.element_name + '-');
            page.element_id = id;
            $(tab_li).find('a').attr('href', '#' + id);
        });
        this.$element.find('> div').each(function (index, page) {
            page.id = self.pages[index].element_id;
        });
        this.$element.tabs();
        this.view.on_button_new.add_first(this.do_select_first_visible_tab);
        if (openerp.connection.debug) {
            this.do_attach_tooltip(this, this.$element.find('ul:first'), {
                gravity: 's'
            });
        }
    },
    do_select_first_visible_tab: function() {
        for (var i = 0; i < this.pages.length; i++) {
            var page = this.pages[i];
            if (page.invisible === false) {
                this.$element.tabs("option", "active", page.index );
                break;
            }
        }
    }
});

openerp.web.form.WidgetNotebookPage = openerp.web.form.WidgetFrame.extend({
    template: 'WidgetNotebookPage',
    init: function(view, node, notebook, index) {
        this.notebook = notebook;
        this.index = index;
        this.element_name = 'page_' + index;
        this._super(view, node);
    },
    start: function() {
        this._super.apply(this, arguments);
        this.$element_tab = this.notebook.$element.find(
                '> ul > li:eq(' + this.index + ')');
    },
    update_dom: function() {
        this._super.apply(this, arguments);
        if (this.invisible && this.index === this.notebook.$element.tabs('option', 'selected')) {
            this.notebook.do_select_first_visible_tab();
        }
        this.$element_tab.toggle(!this.invisible);
        this.$element.toggle(!this.invisible);
    }
});

openerp.web.form.WidgetSeparator = openerp.web.form.Widget.extend({
    template: 'WidgetSeparator',
    init: function(view, node) {
        this._super(view, node);
        this.orientation = node.attrs.orientation || 'horizontal';
        if (this.orientation === 'vertical') {
            this.width = '1';
        }
        this.classname += '_' + this.orientation;
    }
});

openerp.web.form.WidgetButton = openerp.web.form.Widget.extend({
    template: 'WidgetButton',
    init: function(view, node) {
        this._super(view, node);
        this.force_disabled = false;
        if (this.string) {
            // We don't have button key bindings in the webclient
            this.string = this.string.replace(/_/g, '');
        }
        if (node.attrs.default_focus == '1') {
            // TODO fme: provide enter key binding to widgets
            this.view.default_focus_button = this;
        }
    },
    start: function() {
        this._super.apply(this, arguments);
        var $button = this.$element.find('button');
        $button.click(this.on_click);
        if (this.help || openerp.connection.debug) {
            this.do_attach_tooltip();
        }
        this.setupFocus($button);
    },
    on_click: function() {
        var self = this;
        var $button = this.$element.find('button');
        this.force_disabled = true;
        this.check_disable();
        $button.attr('disabled','disabled')
        this.execute_action().always(function() {
            self.force_disabled = false;
            self.check_disable();
            $button.removeAttr('disabled');
        });
    },
    execute_action: function() {
        var self = this;
        var exec_action = function() {
            if (self.node.attrs.confirm) {
                var def = $.Deferred();
                var dialog = $('<div>' + self.node.attrs.confirm + '</div>').dialog({
                    title: _t('Confirm'),
                    modal: true,
                    buttons: [
                        {text: _t("Cancel"), click: function() {
                                def.resolve();
                                $(this).dialog("close");
                            }
                        },
                        {text: _t("Ok"), click: function() {
                                self.on_confirmed().then(function() {
                                    def.resolve();
                                });
                                $(this).dialog("close");
                            }
                        }
                    ]
                });
                return def.promise();
            } else {
                return self.on_confirmed();
            }
        };
        if (!this.node.attrs.special) {
            previous_ids = self.view.dataset.ids;
            this.view.force_dirty = true;
            return $.when(this.view.recursive_save().then(function() { return exec_action().then(function(){
                if (!!self.view.widget_parent.reload_content) self.view.widget_parent.reload_content();
                return $.Deferred().resolve();
                });
            }));
        } else {
            return exec_action();
        }
    },
    on_confirmed: function() {
        var self = this;

        var context = this.node.attrs.context;
        if (context && context.__ref) {
            context = new openerp.web.CompoundContext(context);
            context.set_eval_context(this._build_eval_context());
        }

        if (typeof(previous_ids)!=='undefined') {
            var ids_diff = _.difference(self.view.dataset.ids, previous_ids);
            if (ids_diff.length) {
                self.view.datarecord.id = ids_diff[0];
                self.view.dataset.index = self.view.dataset.ids.indexOf(ids_diff[0]);
                delete previous_ids;
            } else {
                self.view.dataset.index = self.view.dataset.ids.indexOf(self.view.datarecord.id);
            }
        } else {
            if (_.isString(self.view.datarecord.id)) {
                self.view.dataset.index = self.view.dataset.ids.length - 1;
                self.view.datarecord.id = _.last(self.view.dataset.ids);
            } else {
                self.view.dataset.index = self.view.dataset.ids.indexOf(self.view.datarecord.id);
            }
        }
        return this.view.do_execute_action(
            _.extend({}, this.node.attrs, {context: context}),
            this.view.dataset, this.view.datarecord.id, function () {
                self.view.dataset.cache = [];
                self.view.reload();
            });
    },
    update_dom: function() {
        this._super.apply(this, arguments);
        this.check_disable();
    },
    check_disable: function() {
        var disabled = (this.is_readonly() || this.force_disabled);
        this.$element.find('button').prop('disabled', disabled);
        this.$element.find("button").css('color', disabled ? 'grey' : '');
    }
});

openerp.web.form.WidgetLabel = openerp.web.form.Widget.extend({
    template: 'WidgetLabel',
    init: function(view, node) {
        this.element_name = 'label_' + node.attrs.name;

        this._super(view, node);

        if (this.node.tag == 'label' && !this.string && this.node.children.length) {
            this.string = this.node.children[0];
            this.align = 'left';
        }

        if (this.node.tag == 'label' && (this.align === 'left' || this.node.attrs.colspan || (this.string && this.string.length > 32))) {
            this.template = "WidgetParagraph";
            this.colspan = parseInt(this.node.attrs.colspan || 1, 10);
            // Widgets default to right-aligned, but paragraph defaults to
            // left-aligned
            if (isNaN(parseFloat(this.node.attrs.align))) {
                this.align = 'left';
            }

            this.multilines = this.string && _.str.lines(this.string).length > 1;
        } else {
            this.colspan = 1;
            // this.width = (this.$element && this.$element.is('div')) ? '10%' : '1%';
            this.width = '1%';
            this.decrease_max_width = 1;
            this.nowrap = true;
        }
    },
    render: function () {
        if (this['for'] && this.type !== 'label') {
            return QWeb.render(this.template, {widget: this['for']});
        }
        // Actual label widgets should not have a false and have type label
        return QWeb.render(this.template, {widget: this});
    },
    start: function() {
        this._super();
        var self = this;
        if (this['for'] && (this['for'].help || openerp.connection.debug)) {
            this.do_attach_tooltip(self['for']);
        }
        var $label = this.$element.find('label');
        $label.dblclick(function() {
            var widget = self['for'] || self;
            window.w = widget;
        });
        this.setupFocus($label);
    }
});

openerp.web.form.Field = openerp.web.form.Widget.extend(/** @lends openerp.web.form.Field# */{
    /**
     * @constructs openerp.web.form.Field
     * @extends openerp.web.form.Widget
     *
     * @param view
     * @param node
     */
    init: function(view, node) {
        this.name = node.attrs.name;
        this.value = undefined;
        view.fields[this.name] = this;
        view.fields_order.push(this.name);
        this.type = node.attrs.widget || view.fields_view.fields[node.attrs.name] && view.fields_view.fields[node.attrs.name].type;
        this.element_name = "field_" + this.name + "_" + this.type;

        this._super(view, node);

        if (node.attrs.nolabel != '1' && this.colspan > 1) {
            this.colspan--;
        }
        this.field = view.fields_view.fields[node.attrs.name] || {};
        this.string = node.attrs.string || this.field.string;
        this.help = node.attrs.help || this.field.help;
        this.nolabel = (this.field.nolabel || node.attrs.nolabel) === '1';
        this.readonly = this.modifiers['readonly'] === true;
        this.soft_readonly = ( this.modifiers['soft_readonly'] === true || node.attrs.soft_readonly == (1 || true) );
        this.required = this.modifiers['required'] === true;
        this.invalid = this.dirty = false;
        this.invisible = this.invisible || this.node.attrs && this.node.attrs['invisible'] === '1';
        this.classname = 'oe_form_field_' + this.type;
    },
    start: function() {
        var self = this;
        this._super.apply(this, arguments);
        if (this.field.translate) {
            this.view.translatable_fields.push(this);
            this.$element.addClass('oe_form_field_translatable');
            this.$element.find('.oe_field_translate').click(this.on_translate);
        }
        if (this.nolabel && openerp.connection.debug) {
            this.do_attach_tooltip(this, this.$element);
        }
        self.$element.find('input,textarea').bind('blur', function(e) {self.on_blur(e); })
            .bind('focus', function(e) {self.on_focus(e); });
    },
    stop: function() {
        this._super();
        $.async_when().then(function(){
            if (this.$input)
            {
                _.each(this.$input,function(el){
                    el.remove();
                });
                this.$input = null;
            }
        });
    },
    on_blur: function(e) {
    },
    add_listeners: function(element) {
        var self= this,
            $input = element || self.$element.find('input,textarea');
        var delay = (function(){
            var timer = 0;
            return function(callback, ms){
                clearTimeout(timer);
                timer = setTimeout(callback, ms);
            };
        })();
        $input.change(function(e){
            if ( openerp.web.parse_value(self.$element.find('input').val(),self) !== self.get_value() ) {
                self.on_ui_change();
            }
        });
        $input.bind('paste', function(event) {
            self.on_ui_change(); self.on_ui_change(); self.set_value_from_ui();
        });
        $input.bind('cut', function(event) {
            self.on_ui_change(); self.on_ui_change(); self.set_value_from_ui();
        });
        self.$element.find('input,textarea').keyup(function(e){
            var avoid_keys = [9, 13, 16, 17, 18, 0, 67, 37, 38, 39, 40];
            /*
            9 -- Tab
            13 -- Enter
            */
            if (avoid_keys.indexOf(e.which)<0)
            {
                var keypressed = e.which;
                if ((keypressed>=48 && keypressed<=57)
                    || (keypressed>=65 && keypressed<=90 && keypressed!=83)
                    || (keypressed>=96 && keypressed<=111)
                    || ($.inArray(keypressed,[187,189,192,46,32,8])>=0?true:false))
                {
                    try {
                        self.wait_for_onchange = true;
                        openerp.web.parse_value(self.$element.find('input').val(),self);
                        self.dirty = true;
                        delay(function(){
                            if (self.wait_for_onchange)
                            {
                                self.view.forbid_focus_default = true;
                                self.set_value_from_ui();
                                self.on_ui_change();
                                self.wait_for_onchange = false;
                            }
                        },400);
                    } catch(err) {
                        console.warn('Field value "',self.name||self.string||self.$element.find('input'),'" is Not valid');
                    }
                }
                return
            }
            switch (e.keyCode) {
                case 9:
                    self.wait_for_onchange = false;
                    break;
                case 13:
                    if ( openerp.web.parse_value(self.$element.find('input').val(),self) !== self.get_value() )
                        self.on_ui_change();
                    break;
            }
        });
    },
    on_focus: function(e) {
    },
    set_value: function(value) {
        this.value = value;
        this.invalid = false;
        this.update_dom();
        this.on_value_changed();
    },
    set_value_from_ui: function() {
        this.on_value_changed();
    },
    on_value_changed: function() {
    },
    on_translate: function() {
        this.view.open_translate_dialog(this);
    },
    get_value: function() {
        return this.value;
    },
    is_valid: function() {
        return !this.invalid;
    },
    is_dirty: function() {
        return this.dirty && (!this.is_readonly() || this.soft_readonly);
    },
    get_on_change_value: function() {
        return this.get_value();
    },
    update_dom: function(show_invalid) {
        this._super.apply(this, arguments);
        if (this.field.translate) {
            this.$element.find('.oe_field_translate').toggle(!!this.view.datarecord.id);
        }
        if (!this.disable_utility_classes) {
            this.$element.toggleClass('disabled', this.is_readonly() || this.soft_readonly);
            this.$element.toggleClass('required', this.required);
            if (show_invalid) {
                this.$element.toggleClass('invalid', !this.is_valid());
            }
        }
    },
    move_to_next_ui_field: function() {
        var field_name = this.name, self = this;
        try {
            for (var i = this.view.fields_order.indexOf(field_name)+1; i<this.widget_parent.view.fields_order.length; i++) {
                var next_field_name = this.widget_parent.view.fields_order[i];
                var next_field = this.view.fields[next_field_name];
                if (next_field.readonly!==true && !next_field.node.attrs.invisible && !next_field.invisible) {
                    return next_field;
                }
            }
            return self.view.fields[self.view.fields_order[0]];
        } catch(err){console.warn(err);}
    },
    on_ui_change: function() {
        var self = this;
        this.dirty = true;
        this.validate();
        if (this.is_valid()) {
            if (this.is_dirty() && this.get_value()) {
                if (this.move_forward && this.move_forward==true) {
                    var __focus_field = this.move_to_next_ui_field();
                    this.view.forbid_focus_default = true;
                    if (self.view instanceof openerp.web.ListEditableFormView == false)
                        self.view.default_focus_field = null;
                    this.view.on_change_mutex.def.done(function() {
                        setTimeout(function(){
                            __focus_field.focus();
                        },100);
                    });
                } else {
                    this.view.forbid_focus_default = null;
                }
            }
            this.set_value_from_ui();
            this.trigger_view();
        }
        this.update_dom(true);
    },
    trigger_view: function() {
        var self = this;
        if (self.view.is_dirty()) {
            var tabEditedTitle = $('#tab_navigator .ui-state-default.ui-corner-top.ui-tabs-selected.ui-state-active').find('a[href^="#"]').attr('href');
            if (tabEditedTitle!==undefined) {
                if ($.inArray(tabEditedTitle, edited_tabs)<0) {edited_tabs.push(tabEditedTitle); }
            }
            if (self.view.confirm_reload) {
                self.view.confirm_reload();
            } else {
                var _this_view = "this.view";
                do {
                    _this_view=_this_view.concat(".widget_parent");
                } while (
                    typeof(eval(_this_view.concat(".fiels_view")))!='undefined' && eval(_this_view.concat(".fiels_view"))!="form"
                    )
                _this_view = eval(_this_view);
                _this_view.confirm_reload && _this_view.confirm_reload();
            }
            self.view.do_onchange(self);
            self.view.on_form_changed(true);
            self.view.do_notify_change();
        }
    },
    validate: function() {
        this.invalid = false;
    },
    focus: function($element, msec) {
        var focus_element;
        if ($element) {
                focus_element = $element;
        } else {
            if (!!this.$element && this.$element.find('textarea,input').length)
                focus_element = this.$element.find('textarea,input:not([disabled]):nth(0)');
        }
        if (!!focus_element && !_.isEmpty(focus_element))
            setTimeout(function() {
                focus_element.focus().select();
            }, (msec || 50));
    },
    reset: function() {
        this.dirty = false;
    },
    get_definition_options: function() {
        if (!this.definition_options) {
            var str = this.node.attrs.options || '{}';
            this.definition_options = JSON.parse(str);
        }
        return this.definition_options;
    }
});

openerp.web.form.FieldChar = openerp.web.form.Field.extend({
    template: 'FieldChar',
    init: function (view, node) {
        this._super(view, node);
        this.password = this.node.attrs.password === 'True' || this.node.attrs.password === '1';
    },
    start: function() {
        this._super.apply(this, arguments);
        var $input = this.$element.find('input');
        this.setupFocus($input);
        this.add_listeners($input);
    },
    set_value: function(value) {
        this._super.apply(this, arguments);
        var show_value = openerp.web.format_value(value, this, '');
        this.$element.find('input').val(show_value);
        return show_value;
    },
    update_dom: function() {
        this._super.apply(this, arguments);
        this.$element.find('input').prop('readonly', this.is_readonly() || this.soft_readonly);
    },
    set_value_from_ui: function() {
        this.value = openerp.web.parse_value(this.$element.find('input').val(), this);
        this._super();
    },
    validate: function() {
        this.invalid = false;
        try {
            var value = openerp.web.parse_value(this.$element.find('input').val(), this, '');
            this.invalid = this.required && value === '';
        } catch(e) {
            this.invalid = true;
        }
    },
    focus: function($element) {
        this._super($element || this.$element.find('input:first'));
    }
});

openerp.web.form.FieldID = openerp.web.form.FieldChar.extend({
    update_dom: function() {
        this._super.apply(this, arguments);
        this.$element.find('input').prop('readonly', true);
    }
});

openerp.web.form.FieldEmail = openerp.web.form.FieldChar.extend({
    template: 'FieldEmail',
    start: function() {
        this._super.apply(this, arguments);
        var $button = this.$element.find('button');
        $button.click(this.on_button_clicked);
        this.setupFocus($button);
    },
    on_button_clicked: function() {
        if (!this.value || !this.is_valid()) {
            this.do_warn(_t("E-mail error"), _t("Can't send email to invalid e-mail address"));
        } else {
            location.href = 'mailto:' + this.value;
        }
    }
});

openerp.web.form.FieldGeoLocation = openerp.web.form.FieldChar.extend({
    template: 'FieldGeoLocation',
    start: function() {
        this._super.apply(this, arguments);
        var $button = this.$element.find('button');
        $button.click(this.on_button_clicked);
        this.setupFocus($button);
    },
    on_button_clicked: function() {
        if (this.value===false) return;
        var address = this.value;
        var $mapCanv = document.createElement('div');
        $mapCanv.id = 'map-canvas';
        $mapCanv.style.height = '800px';
        document.body.appendChild($mapCanv);
        var map_canvas = document.getElementById('map-canvas');
        var geocoder;
        var map;
        var initialize = (function() {
            geocoder = new google.maps.Geocoder();
            var latlng = new google.maps.LatLng(-34.397, 150.644);
            var mapOptions = {
                zoom: 15,
                center: latlng,
                mapTypeId: google.maps.MapTypeId.ROADMAP
            }
        map = new google.maps.Map(map_canvas, mapOptions);
        codeAddress();
        });
        var open_popup = (function(title){
            openerp.web.form.dialog(map_canvas, {
                close: function() {
                    $('#map-canvas').remove();
                },
                title: "Map location for:  " + title,
            });
        });
        var codeAddress = (function () {
            geocoder.geocode( { 'address': address}, function(results, status) {
                if (status == google.maps.GeocoderStatus.OK) {
                map.setCenter(results[0].geometry.location);
                var marker = new google.maps.Marker({
                    map: map,
                    position: results[0].geometry.location
                });
                google.maps.event.trigger(map, 'resize');
                open_popup(results[0].formatted_address);
                $(map_canvas).height(800);
                } else {
                    alert('Geocode was not successful for the following reason: ' + status);
                }
            });
        });
        google.maps.event.addDomListener(window, 'load', initialize());
    }
});

openerp.web.form.FieldUrl = openerp.web.form.FieldChar.extend({
    template: 'FieldUrl',
    start: function() {
        this._super.apply(this, arguments);
        var $button = this.$element.find('button');
        $button.click(this.on_button_clicked);
        this.setupFocus($button);
    },
    on_button_clicked: function() {
        if (!this.value) {
            this.do_warn(_t("Resource error"), _t("This resource is empty"));
        } else {
            var s = /(\w+):(.+)/.exec(this.value);
            if (!s) {
                this.value = "http://" + this.value;
            }
            window.open(this.value);
        }
    }
});

openerp.web.form.FieldFloat = openerp.web.form.FieldChar.extend({
    init: function (view, node) {
        this._super(view, node);
        if (node.attrs.digits) {
            this.digits = py.eval(node.attrs.digits).toJSON();
        } else {
            this.digits = view.fields_view.fields[node.attrs.name].digits;
        }

    },
    set_value: function(value) {
        if (value === false || value === undefined || value === null) {
            // As in GTK client, floats default to 0
            value = 0;
        }
        this._super.apply(this, [value]);
    },
    start: function() {
        var self = this;
        this._super.apply(this, arguments);
        this.$element.find('input')[0].addEventListener('focus',function(e){
            if (this.readOnly) return;
            var delay = (function(){
                var timer = 0;
                return function(callback, ms){
                    clearTimeout(timer);
                    timer = setTimeout(callback, ms);
                };
            })();
            var spinner = (function(){
                if ($(e.target).mousewheel)
                    $(e.target).mousewheel(function(event){
                        event.preventDefault();
                        event.stopImmediatePropagation();
                        event.stopPropagation();
                        var delta;
                        if (event.originalEvent.wheelDelta > 0) {
                            delta = 1;
                        } else if (event.originalEvent.wheelDelta < 0) {
                            delta = -1;
                        }
                        delta = delta || 0;
                        var new_value = Math.max(parseFloat(event.target.value)+delta,0);
                        $(e.target).val(new_value);
                        self.dirty = !!delta || self.dirty;
                        delay(function(){
                            self.set_value_from_ui();
                            self.on_ui_change();
                        },1000);
                        $(e.target).mouseout(function(sub_event){
                            $(this).unbind('mousewheel');
                            self.set_value_from_ui();
                            self.on_ui_change();
                        });
                    })
            });
            spinner();
            $(e.target).mouseover(function(sub_event){
                spinner();
            });
            $(e.target).mouseout(function(sub_event){
                $(this).unbind('mousewheel');
            });
        });
    },
});

openerp.web.DateTimeWidget = openerp.web.OldWidget.extend({
    template: "web.datetimepicker",
    jqueryui_object: 'datetimepicker',
    type_of_date: "datetime",
    init: function(parent) {
        this._super(parent);
        this.name = parent.name;
        this.move_forward = true;
    },
    start: function() {
        var self = this;
        this.$input = this.$element.find('input.oe_datepicker_master');
        this.$input_picker = this.$element.find('input.oe_datepicker_container');
        this.$input.change(this.on_change);

        $.datepicker.setDefaults({
            clearText: _t('Clear'),
            clearStatus: _t('Erase the current date'),
            closeText: _t('Done'),
            closeStatus: _t('Close without change'),
            prevText: _t('<Prev'),
            prevStatus: _t('Show the previous month'),
            nextText: _t('Next>'),
            nextStatus: _t('Show the next month'),
            currentText: _t('Today'),
            currentStatus: _t('Show the current month'),
            monthNames: Date.CultureInfo.monthNames,
            monthNamesShort: Date.CultureInfo.abbreviatedMonthNames,
            monthStatus: _t('Show a different month'),
            yearStatus: _t('Show a different year'),
            weekHeader: _t('Wk'),
            weekStatus: _t('Week of the year'),
            dayNames: Date.CultureInfo.dayNames,
            dayNamesShort: Date.CultureInfo.abbreviatedDayNames,
            dayNamesMin: Date.CultureInfo.shortestDayNames,
            dayStatus: _t('Set DD as first week day'),
            dateStatus: _t('Select D, M d'),
            firstDay: Date.CultureInfo.firstDayOfWeek,
            initStatus: _t('Select a date'),
            isRTL: false
        });
        $.timepicker.setDefaults({
            timeOnlyTitle: _t('Choose Time'),
            timeText: _t('Time'),
            hourText: _t('Hour'),
            minuteText: _t('Minute'),
            secondText: _t('Second'),
            currentText: _t('Now'),
            closeText: _t('Done')
        });

        this.picker({
            onSelect: this.on_picker_select,
            changeMonth: true,
            changeYear: true,
            showWeek: true,
            showButtonPanel: true,
            appendTo: !!self.widget_parent.view ? self.widget_parent.view.$element : self.$element.closest('.oe_searchview_field,body')
        });
        this.$element.find('img.oe_datepicker_trigger').click(function() {
            if (self.is_readonly() || self.picker('widget').is(':visible')) {
                self.$input.focus();
                return;
            }
            self.picker('setDate', self.value ? openerp.web.auto_str_to_date(self.value) : new Date());
            self.$input_picker.show();
            self.picker('show');
            self.$input_picker.hide();
        });
        this.set_readonly(false);
        this.value = false;
    },
    stop: function() {
        if (this.$input)
        {
            this.$input.datetimepicker('widget').unbind().removeData().empty().remove();
            this.$input.datetimepicker = null;
        }
        if (this.$input_picker)
        {
            _.each(this.$input_picker, function(el){
                el.remove();
            });
            // this.$input_picker.unbind().removeData().empty();
            delete this.$input_picker;
        }
        this._super();
    },
    picker: function() {
        return $.fn[this.jqueryui_object].apply(this.$input_picker, arguments);
    },
    on_picker_select: function(text, instance) {
        var date = this.picker('getDate');
        this.$input
            .val(date ? this.format_client(date) : '')
            .change()
            .focus();
    },
    set_value: function(value) {
        this.value = value;
        this.$input.val(value ? this.format_client(value) : '');
    },
    get_value: function() {
        return this.value;
    },
    set_value_from_ui: function() {
        var value = this.$input.val() || false;
        this.value = this.parse_client(value);
    },
    set_readonly: function(readonly) {
        this.readonly = readonly;
        this.$input.prop('readonly', this.is_readonly());
        this.$element.find('img.oe_datepicker_trigger').toggleClass('oe_input_icon_disabled', readonly);
    },
    is_valid: function(required) {
        var value = this.$input.val();
        if (value === "") {
            return !required;
        } else {
            try {
                this.parse_client(value);
                return true;
            } catch(e) {
                return false;
            }
        }
    },
    is_readonly: function() {
        return this.readonly || (this.widget_parent && this.widget_parent.is_readonly && this.widget_parent.is_readonly());
    },
    parse_client: function(v) {
        return openerp.web.parse_value(v, {"widget": this.type_of_date});
    },
    format_client: function(v) {
        return openerp.web.format_value(v, {"widget": this.type_of_date});
    },
    on_change: function() {
        if (this.is_valid()) {
            this.set_value_from_ui();
        }
    }
});

openerp.web.DateWidget = openerp.web.DateTimeWidget.extend({
    jqueryui_object: 'datepicker',
    type_of_date: "date",
});

openerp.web.form.FieldDatetime = openerp.web.form.Field.extend({
    template: "EmptyComponent",
    build_widget: function() {
        return new openerp.web.DateTimeWidget(this);
    },
    start: function() {
        var self = this;
        this.move_forward  = (!!this.node.attrs.move_forward && this.node.attrs.move_forward!=='0')?true:false;
        this._super.apply(this, arguments);
        this.datewidget = this.build_widget();
        this.datewidget.on_change.add_last(this.on_ui_change);
        this.datewidget.appendTo(this.$element);

        var in_picker = false;
        this.datewidget.picker('option', 'beforeShow', function () {
            in_picker = true;
        });
        this.datewidget.picker('option', 'onClose', function () {
            in_picker = false;
        });
        this.datewidget.$input.bind({
            focus: function () {
                if (!in_picker) {
                    $(self).trigger('widget-focus');
                }
            },
            blur: function () {
                if (!in_picker) {
                    $(self).trigger('widget-blur');
                }
            }
        });
    },
    stop: function() {
        if (this.datewidget.$input && this.datewidget.$input[0])
        {
            this.datewidget.$input[0].remove();
            delete this.datewidget.$input;
        }
        this._super();
    },
    set_value: function(value) {
        this._super(value);
        this.datewidget.set_value(value);
    },
    get_value: function() {
        return this.datewidget.get_value();
    },
    update_dom: function() {
        this._super.apply(this, arguments);
        this.datewidget.set_readonly(this.is_readonly());
    },
    validate: function() {
        this.invalid = !this.datewidget.is_valid(this.required);
    },
    focus: function($element) {
        this._super($element || this.datewidget.$input);
    }
});

openerp.web.form.FieldDate = openerp.web.form.FieldDatetime.extend({
    build_widget: function() {
        return new openerp.web.DateWidget(this);
    }
});

openerp.web.form.FieldText = openerp.web.form.Field.extend({
    template: 'FieldText',
    start: function() {
        this._super.apply(this, arguments);
        var $textarea = this.$element.find('textarea');
        this.resized = false;
        this.setupFocus($textarea);
        this.add_listeners($textarea);
        if (this.view instanceof openerp.web.ListEditableFormView == false)
            this.resizable_bottom();
    },
    set_value: function(value) {
        this._super.apply(this, arguments);
        var show_value = openerp.web.format_value(value, this, '');
        this.get_element('textarea').val(show_value);
        if (!this.resized && this.view.options.resize_textareas) {
            this.do_resize(this.view.options.resize_textareas);
            this.resized = true;
        }
    },
    on_focus: function() {
        this._super.apply(this, arguments);
        var self = this;
        if (!!self.view && !!self.view.widget_parent && self.view.widget_parent.__template__==="ListView") {
            setTimeout(function(){self.$element.find('textarea').select();},0);
        } else {
            var $textarea = self.$element.find('textarea');
            $textarea[0].setSelectionRange($textarea.val().length,$textarea.val().length);
        }
    },
    update_dom: function() {
        this._super.apply(this, arguments);
        this.$element.find('textarea').prop('readonly', this.is_readonly());
    },
    set_value_from_ui: function() {
        this.value = openerp.web.parse_value(this.$element.find('textarea').val(), this);
        this._super();
    },
    validate: function() {
        this.invalid = false;
        try {
            var value = openerp.web.parse_value(this.$element.find('textarea').val(), this, '');
            this.invalid = this.required && value === '';
        } catch(e) {
            this.invalid = true;
        }
    },
    focus: function($element) {
        this._super($element || this.$element.find('textarea:first'));
    },
    resizer_dblclick: function() {
        var $textarea = this.get_element('textarea'),
            __content_height = $textarea[0].scrollHeight,
            __client_height = $textarea[0].clientHeight;
        if (__content_height > __client_height) {
            this.old_height = __client_height;
            $textarea.height(__content_height);
        } else {
            $textarea.height(this.old_height || 'initial');
        }
    },
    init_resize: function(event) {
        var self = this,
            $resizer = this.get_element('.ea_textarea_resize'),
            $textarea = this.get_element('textarea'),
            startHeight = $textarea.height();
            startY = event.clientY,
            __document_el = document.documentElement,
            doDrag = function(e) {
                $textarea.height(startHeight + e.clientY - startY);
            },
            stopDrag = function() {
                __document_el.removeEventListener('mousemove', doDrag, false);
                __document_el.removeEventListener('mouseup', stopDrag, false);
                __document_el.removeEventListener('click', stopDrag, false);
            };
        __document_el.addEventListener('mousemove', doDrag, false);
        __document_el.addEventListener('mouseup', stopDrag, false);
        __document_el.addEventListener('click', stopDrag, false);
    },
    resizable_bottom: function() {
        var self = this,
            elem = $('<div class="ea_textarea_resize">'),
            $textarea = this.get_element('textarea');
        $textarea.after(elem);
        var $resizer = this.get_element('.ea_textarea_resize');
        $resizer.on('dblclick', function(e) {
            e.preventDefault();
            e.stopPropagation();
            self.resizer_dblclick();
        });
        $resizer.mousedown( function(e){
            e.preventDefault();
            self.init_resize.call(self, e);
        });
    },
    do_resize: function(max_height) {
        max_height = parseInt(max_height, 10);
        var $input = this.$element.find('textarea'),
            $div = $('<div style="position: absolute; z-index: 1000; top: 0"/>').width($input.width()),
            new_height;
        $div.text($input.val());
        _.each('font-family,font-size,white-space'.split(','), function(style) {
            $div.css(style, $input.css(style));
        });
        $div.appendTo($('body'));
        new_height = $div.height();
        if (new_height < 90) {
            new_height = 90;
        }
        if (!isNaN(max_height) && new_height > max_height) {
            new_height = max_height;
        }
        $div.remove();
        $input.height(new_height);
    },
    reset: function() {
        this.resized = false;
    }
});

openerp.web.form.FieldTextWysiwyg = openerp.web.form.FieldText.extend({
    start: function() {
        var self = this;
        this._super.apply(this, arguments);
        this.$input = this.$element.find('textarea');
        var options = {
            // width: 100%,
            height:       250, // height not including margins, borders or padding
            controls:     // controls to add to the toolbar
              "bold italic underline strikethrough subscript superscript | font size " +
              "style | color highlight removeformat | bullets numbering | outdent " +
              "indent | alignleft center alignright justify | undo redo | " +
              "rule image link unlink | cut copy paste pastetext | print source",
            colors:       // colors in the color popup
              "FFF FCC FC9 FF9 FFC 9F9 9FF CFF CCF FCF " +
              "CCC F66 F96 FF6 FF3 6F9 3FF 6FF 99F F9F " +
              "BBB F00 F90 FC6 FF0 3F3 6CC 3CF 66C C6C " +
              "999 C00 F60 FC3 FC0 3C0 0CC 36F 63F C3C " +
              "666 900 C60 C93 990 090 399 33F 60C 939 " +
              "333 600 930 963 660 060 366 009 339 636 " +
              "000 300 630 633 330 030 033 006 309 303",
            fonts:        // font names in the font popup
              "Arial,Arial Black,Comic Sans MS,Courier New,Narrow,Garamond," +
              "Georgia,Impact,Sans Serif,Serif,Tahoma,Trebuchet MS,Verdana",
            sizes:        // sizes in the font size popup
              "1,2,3,4,5,6,7",
            styles:       // styles in the style popup
              [["Paragraph", "<p>"], ["Header 1", "<h1>"], ["Header 2", "<h2>"],
                ["Header 3", "<h3>"],  ["Header 4","<h4>"],  ["Header 5","<h5>"],
                ["Header 6","<h6>"]],
            useCSS:       false, // use CSS to style HTML when possible (not supported in ie)
            docType:      // Document type contained within the editor
              '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN" "http://www.w3.org/TR/html4/loose.dtd">',
            docCSSFile:   // CSS file used to style the document contained within the editor
              "",
            bodyStyle:    // style to assign to document body contained within the editor
              "margin:4px; font:10pt Arial,Verdana; cursor:text",
        };
        this.cleditor = this.$input.cleditor(options)[0];
        var width_set = {'width': '100%'};
        this.cleditor.$toolbar.css(width_set);
        this.cleditor.$area.css(width_set);
        this.cleditor.$frame.css(width_set);
        var notify_change = function() {
            self.view.dirty=true;
            self.view.is_dirty();
            if (self.is_dirty())
                self.on_ui_change()
        };
        this.cleditor.change(function(){
            notify_change()
        });
        this.cleditor.$area.on('key', function(event) {
            if ($.inArray(event.data.keyCode,[4456466,1114129,2228240,91,27])<0) {
                notify_change()
            }
        });
        $(this.cleditor.doc)
            .on('cut', function(){
                setTimeout(function(){notify_change()},0);
            })
            .on('paste', function() {
                setTimeout(function(){notify_change()},0);
             })
            .end();
    },
    resizable_bottom: function() {},
    update_dom: function() {
        this._super.apply(this, arguments);
        this.cleditor.disable(this.is_readonly());
    },
    is_dirty: function() {
        return this.original_value !== this.get_value();
    },
    get_value: function() {
        return this.cleditor.$frame.contents()[0].getElementsByTagName('body')[0].innerHTML;
    },
    set_value: function (value) {
        this._super.apply(this, arguments);
        this.cleditor.updateFrame();
        // this.$input.cleditor()[0].refresh();
        this.original_value = value
    }
});

openerp.web.form.FieldBoolean = openerp.web.form.Field.extend({
    template: 'FieldBoolean',
    start: function() {
        var self = this;
        this._super.apply(this, arguments);
        this.$input = this.$element.find('input');
        this.$input.click(self.on_ui_change);
        this.setupFocus(this.$input);
    },
    set_value: function(value) {
        this._super.apply(this, arguments);
        this.$input[0].checked = value;
    },
    set_value_from_ui: function() {
        this.value = this.$input.is(':checked');
        this._super();
    },
    update_dom: function() {
        this._super.apply(this, arguments);
        this.$input[0].disabled = this.is_readonly();
    },
    focus: function($element) {
        this._super($element || this.$element.find('input:first'));
    }
});

openerp.web.form.FieldProgressBar = openerp.web.form.Field.extend({
    template: 'FieldProgressBar',
    start: function() {
        this._super.apply(this, arguments);
        this.$element.find('div').progressbar({
            value: this.value,
            disabled: this.is_readonly()
        });
    },
    set_value: function(value) {
        this._super.apply(this, arguments);
        var show_value = Number(value);
        if (isNaN(show_value)) {
            show_value = 0;
        }
        var formatted_value = openerp.web.format_value(show_value, { type : 'float' }, '0');
        this.$element.find('div').progressbar().progressbar('value',show_value).find('span').html(formatted_value + '%');
    }
});

openerp.web.form.FieldTextXml = openerp.web.form.Field.extend({
// to replace view editor
});

openerp.web.form.FieldSelection = openerp.web.form.Field.extend({
    template: 'FieldSelection',
    init: function(view, node) {
        var self = this;
        this._super(view, node);
        this.values = _.clone(this.field.selection);
        this.move_forward  = (!!this.node.attrs.move_forward && this.node.attrs.move_forward!=='0')?true:false;
        _.each(this.values, function(v, i) {
            if (v[0] === false && v[1] === '') {
                self.values.splice(i, 1);
            }
        });
        this.values.unshift([false, '']);
    },
    start: function() {
        // Flag indicating whether we're in an event chain containing a change
        // event on the select, in order to know what to do on keyup[RETURN]:
        // * If the user presses [RETURN] as part of changing the value of a
        //   selection, we should just let the value change and not let the
        //   event broadcast further (e.g. to validating the current state of
        //   the form in editable list view, which would lead to saving the
        //   current row or switching to the next one)
        // * If the user presses [RETURN] with a select closed (side-effect:
        //   also if the user opened the select and pressed [RETURN] without
        //   changing the selected value), takes the action as validating the
        //   row
        var self = this;
        var ischanging = false;
        this._super.apply(this, arguments);
        var $select = this.$element.find('select');
        $select
            .change(this.on_ui_change)
            .change(function () { ischanging = true; })
            .click(function () { ischanging = false; })
            .keyup(function (e) {
                if (e.which !== 13 || !ischanging) { return; }
                e.stopPropagation();
                ischanging = false;
            });
        this.setupFocus($select);
        if (self.node.attrs.disabled_options) {
            _.each(self.node.attrs.disabled_options.split(','), function(option_name) {
                option_name = option_name.trim()
                self.$element.find('option[value="' + option_name + '"]').attr('disabled', 'disabled');
            });
        }
    },
    set_value: function(value) {
        value = value === null ? false : value;
        value = value instanceof Array ? value[0] : value;
        this._super(value);
        var index = 0;
        for (var i = 0, ii = this.values.length; i < ii; i++) {
            if (this.values[i][0] === value) index = i;
        }
        this.$element.find('select')[0].selectedIndex = index;
    },
    set_value_from_ui: function() {
        this.value = this.values[this.$element.find('select')[0].selectedIndex][0];
        this._super();
    },
    update_dom: function() {
        this._super.apply(this, arguments);
        this.$element.find('select').prop('disabled', this.is_readonly() || this.soft_readonly);
    },
    validate: function() {
        var value = this.values[this.$element.find('select')[0].selectedIndex];
        this.invalid = !(value && !(this.required && value[0] === false));
    },
    focus: function($element) {
        this._super($element || this.$element.find('select:first'));
    }
});

// jquery autocomplete tweak to allow html
(function() {
    var proto = $.ui.autocomplete.prototype,
        initSource = proto._initSource;

    function filter( array, term ) {
        var matcher = new RegExp( $.ui.autocomplete.escapeRegex(term), "i" );
        return $.grep( array, function(value) {
            return matcher.test( $( "<div>" ).html( value.label || value.value || value ).text() );
        });
    }

    $.extend( proto, {
        _initSource: function() {
            if ( this.options.html && $.isArray(this.options.source) ) {
                this.source = function( request, response ) {
                    response( filter( this.options.source, request.term ) );
                };
            } else {
                initSource.call( this );
            }
        },

        _renderItem: function( ul, item) {
            return $( "<li></li>" )
                .data( "item.autocomplete", item )
                .append( $( "<a></a>" )[ this.options.html ? "html" : "text" ]( item.label ) )
                .appendTo( ul );
        }
    });
})();

openerp.web.form.dialog = function(content, options) {
    options = _.extend({
        width: '90%',
        height: 'auto',
        min_width: '800px'
    }, options || {});
    var dialog = new openerp.web.Dialog(null, options, content).open();
    return dialog.$element;
};

openerp.web.form.FieldMany2One = openerp.web.form.Field.extend({
    template: 'FieldMany2One',
    init: function(view, node) {
        this._super(view, node);
        this.limit = 7;
        this.value = null;
        this.cm_id = _.uniqueId('m2o_cm_');
        this.move_forward  = (!!this.node.attrs.move_forward && this.node.attrs.move_forward!=='0') ? true : false;
        this.quick_create = this.node.attrs.quick_create == true
        this.last_search = [];
        this.tmp_value = undefined;
    },
    start: function() {
        this._super();
        var self = this;
        this.$input = this.$element.find("input");
        this.$drop_down = this.$element.find(".oe-m2o-drop-down-button");
        this.$menu_btn = this.$element.find(".oe-m2o-cm-button");
        // context menu
        var init_context_menu_def = $.Deferred().done(function(e) {
            var rdataset = new openerp.web.DataSetStatic(self, "ir.values", self.build_context());
            rdataset.call("get", ['action', 'client_action_relate',
                [[self.field.relation, false]], false, rdataset.get_context()], false, 0)
                .then(function(result) {
                self.related_entries = result;

                var $cmenu = $("#" + self.cm_id);
                $cmenu.append(QWeb.render("FieldMany2One.context_menu", {widget: self}));
                var bindings = {};
                bindings[self.cm_id + "_search"] = function() {
                    if (self.is_readonly())
                        return;
                    self._search_create_popup("search");
                };
                bindings[self.cm_id + "_create"] = function() {
                    if (self.is_readonly())
                        return;
                    self._search_create_popup("form");
                };
                bindings[self.cm_id + "_open"] = function() {
                    if (!self.value) {
                        self.focus();
                        return;
                    }
                    var pop = new openerp.web.form.FormOpenPopup(self.view);
                    self.context = (self.context==null)?self.view.dataset.context:self.context;
                    pop.dataset = new openerp.web.DataSet(self, self.field.relation, self.context, self.domain);
                    pop.dataset.ids = [self.value[0]];
                    if (typeof self.node.attrs.context == 'object')
                        {
                        self.context['context_from_parent_node'] = String(JSON.stringify(self.node.attrs.context));
                        }
                    self.context['dataset_ids_when_form_open'] = pop.dataset.ids;
                    pop.show_element(
                        self.field.relation,
                        self.value[0],
                        self.build_context(),
                        {
                            title: _t("Open: ") + (self.string || self.name),
                            parent_view: self.view,
                        },
                        pop.dataset
                    );
                    pop.on_write_completed.add_last(function() {
                        self.set_value(self.value[0]);
                        self.focus();
                    });
                };
                _.each(_.range(self.related_entries.length), function(i) {
                    bindings[self.cm_id + "_related_" + i] = function() {
                        self.open_related(self.related_entries[i]);
                    };
                });
                var cmenu = self.$menu_btn.contextMenu(self.cm_id, {'noRightClick': true,
                    bindings: bindings, itemStyle: {"color": ""},
                    onContextMenu: function() {
                        if(self.value) {
                            $("#" + self.cm_id + " .oe_m2o_menu_item_mandatory").removeClass("oe-m2o-disabled-cm");
                        } else {
                            $("#" + self.cm_id + " .oe_m2o_menu_item_mandatory").addClass("oe-m2o-disabled-cm");
                        }
                        if (!self.is_readonly()) {
                            $("#" + self.cm_id + " .oe_m2o_menu_item_noreadonly").removeClass("oe-m2o-disabled-cm");
                        } else {
                            $("#" + self.cm_id + " .oe_m2o_menu_item_noreadonly").addClass("oe-m2o-disabled-cm");
                        }
                        return true;
                    }, menuStyle: {width: "200px"}
                });
                $.async_when().then(function() {self.$menu_btn.trigger(e);});
            });
        });

        var ctx_callback = function(e) {init_context_menu_def.resolve(e); e.preventDefault()};
        this.$menu_btn.click(ctx_callback);
        this.$input.focusin(function(e) {
            self.$input = $(e.target);
        });

        var __autocmplt_visible = false;
        this.$drop_down.click(function(event) {
            self.$input.focus();
            var clear_timer = function(){
                if (typeof(timer_to_close_listbox)!=='undefined') {
                    clearTimeout(timer_to_close_listbox);
                    }
                },
                hide_listboxes = function() {
                    $('[role="listbox"]:visible').hide();
                    clear_timer();
                    return true;
                },
                close_listbox = function(){
                    clear_timer();
                    // unbind closing autocomplete widget on global focus out
                    document.onclick = null;
                    if (!self.$input.is(':focus'))
                        timer_to_close_listbox = setTimeout(function(){
                            $('[role="listbox"]:visible').fadeOut(300);
                            delete timer_to_close_listbox;
                        },3000);
                    return true;
                };
            if (self.is_readonly() || self.widget_blurred)
                return;
            if (self.$input.autocomplete("widget").is(":visible") || __autocmplt_visible) {
                self.$input.autocomplete("close");
                self.$input.focus();
                delete __autocmplt_visible;
            } else {
                hide_listboxes();
                close_listbox();
                if (self.value) {
                    self.$input.autocomplete("search", "");
                } else {
                    self.$input.autocomplete("search");
                }
                document.onclick = function(e){
                    if (!self.$input[0].isEqualNode($(e.target).closest('.oe_form_frame_cell').find('input')[0]))
                        self.$input.blur();
                };
                $('[role="listbox"]').mouseover(function(){ clear_timer() });
                $('[role="listbox"]').mouseout(function(){ close_listbox() });
            }
        });
        this.$drop_down.mousedown(function(){
            __autocmplt_visible = self.$input.autocomplete("widget").is(":visible");
        });
        // Autocomplete close on drag dialog
        this.$input.closest(".ui-dialog").bind( "dialogdragstart dialogresizestart", function() {
            if (!self.$input.autocomplete('widget').length) {
                self.$input.autocomplete("close");
                self.$input.autocomplete('destroy');
            }
        });

        var anyoneLoosesFocus = function() {
            var $autocomplete = self.$input.autocomplete('widget');
            // unbind closing autocomplete widget on global focus out
            document.onclick = null;
            if (
                !self.$input.is(":focus")
                && self.value == null
                && self.original_value == null
            ) {
                if (self.value === undefined && self.last_search.length > 0 && $autocomplete.is(':active')===false) {
                    self._change_int_ext_value(self.last_search[0]);
                } else {
                    self._change_int_ext_value(null);
                }
            } else if (
                !self.$input.is(":focus")
                && self.last_search.length>0
                ) {
                if (self.$input.val() !== '') {
                    console.log(self.get_string(self.value),  self.$input.val());
                    if (
                        arguments[0].relatedTarget == null || __blurred || !_.isEmpty(self.value) && self.get_string(self.value) == self.$input.val()
                    ) {
                        if (self.original_value != null) {
                            self._change_int_ext_value(self.original_value);
                            return;
                        }
                        self._change_int_ext_value(null);
                        return
                    } else if (
                        $autocomplete.is(':visible')
                        || $autocomplete.is(':active')
                        || self.last_search.length > 0
                        ) {
                        if (
                            $autocomplete.find('.ui-state-focus').length == 0
                            && self.last_search[0] !== self.original_value
                            ) {
                            self._change_int_ext_value(self.last_search[0]);
                        } else if ($autocomplete.find('.ui-state-focus').length == 0) {
                            try {
                                self._change_int_ext_value(self.last_search[$autocomplete.find('li:active').index()]);
                            } catch (err) {
                                console.warn('failed to change',err);
                            }
                        }
                    } else {
                        self._change_int_ext_value(self.original_value);
                        return;
                    }
                } else {
                        self._change_int_ext_value(null);
                }
            }
            self._change_int_ext_value(self.original_value);
            return;
        };
        var $self = $(self), ignore_blur = false, ignore_source = false, __blurred = true;
        this.$input.bind({
            // focusout: function(event) { anyoneLoosesFocus(event) },
            focus: function () { $self.trigger('widget-focus'); },
            autocompleteopen: function () { ignore_blur = true; },
            autocompleteclose: function () { ignore_blur = false; },
            blur: function (event) {
                // autocomplete open
                if (ignore_blur) { return; }
                var child_popup_open = _(self.widget_children).any(function (child) {
                    return child instanceof openerp.web.form.SelectCreatePopup
                        || child instanceof openerp.web.form.FormOpenPopup;
                });
                if (child_popup_open) {
                    return;
                }
            }
        });

        // autocomplete
        this.$input.autocomplete({
            source: function(req, resp) {
                if (ignore_source == false)
                    self.get_search_result(req, resp);
            },
            select: function(event, ui) {
                var item = ui.item;
                if (item.id) {
                    self._change_int_value([item.id, item.name]);
                    if (self.view instanceof openerp.web.ListEditableFormView && self.view.dataset.index==null)
                        self.view.$element.trigger('focusout');
                } else if (item.action) {
                    self._change_int_value(undefined);
                    item.action();
                    return false;
                }
            },
            focus: function(e, ui) {
                e.preventDefault();
            },
            appendTo: self.view.$element,
            html: true,
            close: function(event) {
                if (!__blurred && !ignore_blur) {
                    anyoneLoosesFocus(event);
                }
                else {
                    document.onclick = null;
                }
            },
            minLength: 0,
            delay: 0
        });
        // some behavior for input
        // used to correct a bug when selecting an element by pushing 'enter' in an editable list
        this.$input.keydown(function(e) {
            // avoid opening dropdown autocomplete list on PageUp / PageDown
            // and on Tab key is pressed
            if (e.which == 9)
                __blurred = false;
            else
                __blurred = true;
            if (e.shiftKey || e.which == 33 || e.which == 34) {
                ignore_source = true;
            } else {
                ignore_source = false;
            }
        });
        this.$input.keyup(function(e) {
            if (e.which === 13) {
                if (ignore_blur) {
                    e.stopPropagation();
                }
            }
            if (self.$input.val() === "") {
                var _original_value = self.original_value;
                self._change_int_value(null);
            } else if (self.value === null || (self.value && self.$input.val() !== self.value[1])) {
                self._change_int_value(undefined);
            }
        });
        this.$input.focusout(function(e) {
            if (__blurred) {
                self._change_int_ext_value(self.original_value);
                self.validate();
                self.update_dom(true);
            } else if (!ignore_source && !ignore_blur && self.$input.val() == '') {
                anyoneLoosesFocus(e);
            }
        });

        this.setupFocus(this.$menu_btn);
    },
    stop: function() {
        this._super();
        try {
            if (this.$input && this.$input.autocomplete('widget'))
            {
                this.$input.autocomplete('destroy');
            }
        } catch(e) {}
        if (this.$drop_down)
        {
            this.$drop_down[0].remove();
            delete this.$drop_down;
        }
        if (this.$menu_btn)
        {
            this.$menu_btn[0].remove();
            delete this.$menu_btn;
        }
    },
    get_string: function(value) {
        if (!(value instanceof Array)) {
            return value;
        } else {
            var result;
            for (var i=0; i<value.length; i++) {
                if (!!value[i] && typeof(value[i]) == 'string')
                {
                    result = value[i];
                    break;
                }
            }
            return result;
        }
    },
    // autocomplete component content handling
    get_search_result: function(request, response) {
        var search_val = request.term;
        var self = this;

        if (this.abort_last) {
            this.abort_last();
            delete this.abort_last;
        }
        var dataset = new openerp.web.DataSetStatic(this, this.field.relation, self.build_context());

        dataset.name_search(search_val, self.build_domain(), 'ilike',
                this.limit + 1, function(data) {
            self.last_search = data;
            // possible selections for the m2o
            var values = _.map(data, function(x) {
                return {
                    label: _.str.escapeHTML(x[1]),
                    value:x[1],
                    name:x[1],
                    id:x[0]
                };
            });

            // search more... if more results that max
            if (values.length > self.limit) {
                var open_search_popup = function(data) {
                    self._change_int_value(null);
                    self._search_create_popup("search", data);
                };
                values = values.slice(0, self.limit);
                values.push({label: _t("<em>   Search More...</em>"), action: function() {
                    if (!search_val) {
                        // search optimisation - in case user didn't enter any text we
                        // do not need to prefilter records; for big datasets (ex: more
                        // that 10.000 records) calling name_search() could be very very
                        // expensive!
                        open_search_popup();
                        return;
                    }
                    dataset.name_search(search_val, self.build_domain(),
                                        'ilike', false, open_search_popup);
                }});
            }
            // quick create
            var raw_result = _(data.result).map(function(x) {return x[1];});

            if (search_val.length > 0 &&
                !_.include(raw_result, search_val) &&
                (!self.value || search_val !== self.value[1]) &&
                self.quick_create == true
                // If quick_create attribute is set ot True or "1" , then allow to create new
                ) {
                values.push({label: _.str.sprintf(_t('<em>   Create "<strong>%s</strong>"</em>'),
                        $('<span />').text(search_val).html()), action: function() {
                    self._quick_create(search_val);
                }});
            }
            // create
            values.push({label: _t("<em>   Create and Edit...</em>"), action: function() {
                self._change_int_value(null);
                self._search_create_popup("form", undefined, {"default_name": search_val});
            }});

            response(values);
        });
        this.abort_last = dataset.abort_last;
    },
    _quick_create: function(name) {
        var self = this;
        var slow_create = function () {
            self._change_int_value(null);
            self._search_create_popup("form", undefined, {"default_name": name});
        };
        if (self.get_definition_options().quick_create === undefined || self.get_definition_options().quick_create) {
            var dataset = new openerp.web.DataSetStatic(this, this.field.relation, self.build_context());
            dataset.name_create(name, function(data) {
                self._change_int_ext_value(data);
            }).fail(function(error, event) {
                event.preventDefault();
                slow_create();
            });
        } else
            slow_create();
    },
    // all search/create popup handling
    _search_create_popup: function(view, ids, context) {
        var self = this;
        var pop = new openerp.web.form.SelectCreatePopup(this);
        pop.select_element(
            self.field.relation,
            {
                title: (view === 'search' ? _t("Search: ") : _t("Create: ")) + (this.string || this.name),
                initial_ids: ids ? _.map(ids, function(x) {return x[0]}) : undefined,
                initial_view: view,
                disable_multiple_selection: true
            },
            self.build_domain(),
            new openerp.web.CompoundContext(self.build_context(), context || {}),
            self.dataset
        );
        pop.on_select_elements.add(function(element_ids) {
            var dataset = new openerp.web.DataSetStatic(self, self.field.relation, self.build_context());
            dataset.name_get([element_ids[0]], function(data) {
                self._change_int_ext_value(data[0]);
                self.focus();
            });
        });
    },
    _change_int_ext_value: function(value) {
        this._change_int_value(value);
        this.$input.val(this.value ? this.value[1] : "");
        // this.view.default_focus_field && this.view.default_focus_field.focus(null, 500);
    },
    _change_int_value: function(value) {
        this.value = value;
        var back_orig_value = this.original_value;
        if (this.value === null || this.value) {
            this.original_value = this.value;
        }
        if (back_orig_value === undefined) { // first use after a set_value()
            return;
        } else {
            this.view.forbid_focus_default = !this.value;
        }
        if (this.value !== undefined && ((back_orig_value ? back_orig_value[0] : null)
                !== (this.value ? this.value[0] : null))) {
            this.on_ui_change();
        }
    },
    set_value: function(value) {
        value = value || null;
        this.invalid = false;
        var self = this;
        this.tmp_value = value;
        self.update_dom();
        self.on_value_changed();
        var real_set_value = function(rval) {
            self.tmp_value = undefined;
            self.value = rval;
            self.original_value = undefined;
            self._change_int_ext_value(rval);
        };
        if (value && !(value instanceof Array)) {
            // name_get in a m2o does not use the context of the field
            var dataset = new openerp.web.DataSetStatic(this, this.field.relation, self.view.dataset.get_context());
            dataset.name_get([value], function(data) {
                real_set_value(data[0]);
            }).fail(function() {self.tmp_value = undefined;});
        } else {
            $.async_when().then(function() {real_set_value(value);});
        }
    },
    set_value_list: function(value) {
        value = value || null;
        this.invalid = false;
        var self = this;
        this.tmp_value = value;
        self.update_dom();
        self.on_value_changed();
        var real_set_value = function(rval) {
            self.tmp_value = undefined;
            self.value = rval;
            self.original_value = undefined;
            self._change_int_ext_value(rval);
        };
        if (value && !(value instanceof Array)) {
            if (self.node.attrs.on_change!=='') {
                var dataset = new openerp.web.DataSetStatic(this, this.field.relation, self.view.dataset.get_context());
                dataset.name_get([value], function(data) {
                    real_set_value(data[0]);
                }).fail(function() {self.tmp_value = undefined;});
            }
        } else {
            $.async_when().then(function() {real_set_value(value);});
        }
        // self._change_int_ext_value(value);
    },
    get_value: function() {
         if (this.tmp_value !== undefined) {
            if (this.tmp_value instanceof Array) {
                return this.tmp_value[0];
            }
            return this.tmp_value ? this.tmp_value : false;
         }
         if (this.value === undefined)
            return this.original_value ? this.original_value[0] : false;
        return this.value ? this.value[0] : false;
        // var self = this;
        // if (this.tmp_value !== undefined) {
        //     return self.normalize_value(this.tmp_value);
        // }
        // if (this.value === undefined)
            // return self.normalize_value(self.original_value);
    },
    normalize_value: function(value) {
        if (value instanceof Array) {
            return value[0];
        }
        return value ? value : false;
    },
    validate: function() {
        this.invalid = false;
        var val = this.tmp_value !== undefined ? this.tmp_value : this.value;
        if (val === null) {
            this.invalid = this.required;
        }
    },
    open_related: function(related) {
        var self = this;
        if (!self.value)
            return;
        var additional_context = {
                active_id: self.value[0],
                active_ids: [self.value[0]],
                active_model: self.field.relation
        };
        self.rpc("/web/action/load", {
            action_id: related[2].id,
            context: additional_context
        }, function(result) {
            result.result.context = _.extend(result.result.context || {}, additional_context);
            self.do_action(result.result);
        });
    },
    focus: function ($element) {
        this._super($element || this.$input);
    },
    update_dom: function() {
        this._super.apply(this, arguments);
        this.$input.prop('readonly', this.is_readonly() || this.soft_readonly);
    }
});
openerp.web.form.FieldOne2One = openerp.web.form.FieldMany2One.extend({

});

/*
# Values: (0, 0,  { fields })    create
#         (1, ID, { fields })    update
#         (2, ID)                remove (delete)
#         (3, ID)                unlink one (target id or target of relation)
#         (4, ID)                link
#         (5)                    unlink all (only valid for one2many)
*/
var commands = {
    // (0, _, {values})
    CREATE: 0,
    'create': function (values) {
        return [commands.CREATE, false, values];
    },
    // (1, id, {values})
    UPDATE: 1,
    'update': function (id, values) {
        return [commands.UPDATE, id, values];
    },
    // (2, id[, _])
    DELETE: 2,
    'delete': function (id) {
        return [commands.DELETE, id, false];
    },
    // (3, id[, _]) removes relation, but not linked record itself
    FORGET: 3,
    'forget': function (id) {
        return [commands.FORGET, id, false];
    },
    // (4, id[, _])
    LINK_TO: 4,
    'link_to': function (id) {
        return [commands.LINK_TO, id, false];
    },
    // (5[, _[, _]])
    DELETE_ALL: 5,
    'delete_all': function () {
        return [5, false, false];
    },
    // (6, _, ids) replaces all linked records with provided ids
    REPLACE_WITH: 6,
    'replace_with': function (ids) {
        return [6, false, ids];
    },
    // (7, to_reorder) place lines with ids before line id
    ORDER: 7,
    'order': function (to_reorder) {
        return [7, to_reorder];
    }
};
openerp.web.form.FieldOne2Many = openerp.web.form.Field.extend({
    template: 'FieldOne2Many',
    multi_selection: false,
    init: function(view, node) {
        this._super(view, node);
        this.is_loaded = $.Deferred();
        this.initial_is_loaded = this.is_loaded;
        this.is_setted = $.Deferred();
        this.form_last_update = $.Deferred();
        this.init_form_last_update = this.form_last_update;
        this.disable_utility_classes = true;
    },
    start: function() {
        this._super.apply(this, arguments);

        var self = this;
        this.dataset = new openerp.web.form.One2ManyDataSet(this, this.field.relation);
        this.dataset.o2m = this;
        this.dataset.parent_view = this.view;
        this.dataset.child_name = this.name;
        this.dataset.on_change.add_last(function() {
            self.trigger_on_change();
        });

        this.is_setted.then(function() {
            self.load_views();
        });
    },
    trigger_on_change: function() {
        var tmp = this.doing_on_change;
        this.doing_on_change = true;
        this.on_ui_change();
        this.doing_on_change = tmp;
    },
    is_readonly: function() {
        return this.readonly || this.force_readonly || (!!this.widget_parent && this.widget_parent.is_readonly());
    },
    load_views: function() {
        var self = this;

        var modes = this.node.attrs.mode;
        modes = !!modes ? modes.split(",") : ["tree"];
        var views = [];
        _.each(modes, function(mode) {
            var view = {
                view_id: false,
                view_type: mode == "tree" ? "list" : mode,
                options: { sidebar : false }
            };
            if (self.field.views && self.field.views[mode]) {
                view.embedded_view = self.field.views[mode];
            }
            if(view.view_type === "list") {
                view.options.selectable = self.multi_selection;
                if (self.is_readonly()) {
                    view.options.addable = null;
                    view.options.deletable = null;
                    view.options.isClarkGable = true;
                } else {
                    view.options.deletable = true;
                    view.options.selectable = true;
                    view.options.isClarkGable = true;
                }
            } else if (view.view_type === "form") {
                if (self.is_readonly()) {
                    view.view_type = 'page';
                }
                view.options.not_interactible_on_create = true;
            }
            views.push(view);
        });
        this.views = views;

        this.viewmanager = new openerp.web.ViewManager(this, this.dataset, views, {});
        this.viewmanager.template = 'One2Many.viewmanager';
        this.viewmanager.registry = openerp.web.views.extend({
            list: 'openerp.web.form.One2ManyListView',
            form: 'openerp.web.form.One2ManyFormView',
            page: 'openerp.web.PageView'
        });
        var once = $.Deferred();
        once.then(function() {
            self.init_form_last_update.resolve();
        });
        var def = $.Deferred();
        def.then(function() {
            self.initial_is_loaded.resolve();
        });
        this.viewmanager.on_controller_inited.add_last(function(view_type, controller) {
            if (view_type == "list") {
                controller.o2m = self;
                if (self.is_readonly())
                    controller.set_editable(false);
            } else if (view_type == "form" || view_type == 'page') {
                if (view_type == 'page' || self.is_readonly()) {
                    $(".oe_form_buttons", controller.$element).children().remove();
                }
                controller.on_record_loaded.add_last(function() {
                    once.resolve();
                });
                controller.on_pager_action.add_first(function() {
                    self.save_any_view();
                });
            } else if (view_type == "graph") {
                self.reload_current_view();
            }
            def.resolve();
        });
        this.viewmanager.on_mode_switch.add_first(function(n_mode, b, c, d, e) {
            $.when(self.save_any_view()).then(function() {
                if(n_mode === "list")
                    $.async_when().then(function() {self.reload_current_view();});
            });
        });
        this.is_setted.then(function() {
            $.async_when().then(function () {
                self.viewmanager.appendTo(self.$element);
            });
        });
        return def;
    },
    reload_current_view: function() {
        var self = this;
        return self.is_loaded = self.is_loaded.then(function() {
            var active_view = self.viewmanager.active_view;
            var view = self.viewmanager.views[active_view].controller;
            if(active_view === "list") {
                return view.reload_content();
            } else if (active_view === "form" || active_view === 'page') {
                if (self.dataset.index === null && self.dataset.ids.length >= 1) {
                    self.dataset.index = 0;
                }
                var act = function() {
                    return view.do_show();
                };
                self.form_last_update = self.form_last_update.then(act, act);
                return self.form_last_update;
            } else if (active_view === "graph") {
                return view.do_search(self.build_domain(), self.dataset.get_context(), []);
            }
        }, undefined);
    },
    set_value: function(value) {
        value = value || [];
        var self = this;
        this.dataset.reset_ids([]);
        if(value.length >= 1 && value[0] instanceof Array) {
            var ids = [];
            _.each(value, function(command) {
                var obj = {values: command[2]};
                switch (command[0]) {
                    case commands.CREATE:
                        obj['id'] = _.uniqueId(self.dataset.virtual_id_prefix);
                        obj.defaults = {};
                        self.dataset.to_create.push(obj);
                        self.dataset.cache.push(_.extend(_.clone(obj), {values: _.clone(command[2])}));
                        ids.push(obj.id);
                        return;
                    case commands.UPDATE:
                        obj['id'] = command[1];
                        self.dataset.to_write.push(obj);
                        self.dataset.cache.push(_.extend(_.clone(obj), {values: _.clone(command[2])}));
                        ids.push(obj.id);
                        return;
                    case commands.DELETE:
                        self.dataset.to_delete.push({id: command[1]});
                        return;
                    case commands.LINK_TO:
                        ids.push(command[1]);
                        return;
                    case commands.DELETE_ALL:
                        self.dataset.delete_all = true;
                        return;
                }
            });
            this._super(ids);
            this.dataset.set_ids(ids);
        } else if (value.length >= 1 && typeof(value[0]) === "object") {
            var ids = [];
            this.dataset.delete_all = true;
            _.each(value, function(command) {
                var obj = {values: command};
                obj['id'] = _.uniqueId(self.dataset.virtual_id_prefix);
                obj.defaults = {};
                self.dataset.to_create.push(obj);
                self.dataset.cache.push(_.clone(obj));
                ids.push(obj.id);
            });
            this._super(ids);
            this.dataset.set_ids(ids);
        } else {
            this._super(value);
            this.dataset.reset_ids(value);
        }
        if (this.dataset.index === null && this.dataset.ids.length > 0) {
            this.dataset.index = 0;
        }
        self.is_setted.resolve();
        return self.reload_current_view();
    },
    set_value_list: function(value) {
        var self = this;
        self.update_dom();
        self.value = value;
    },
    get_value: function() {
        var self = this;
        if (!this.dataset)
            return [];
        this.save_any_view();
        var val = this.dataset.delete_all ? [commands.delete_all()] : [];
        val = val.concat(_.map(this.dataset.ids, function(id) {
            var alter_order = _.detect(self.dataset.to_create, function(x) {return x.id === id;});
            if (alter_order) {
                return commands.create(alter_order.values);
            }
            alter_order = _.detect(self.dataset.to_write, function(x) {return x.id === id;});
            if (alter_order) {
                return commands.update(alter_order.id, alter_order.values);
            }
            return commands.link_to(id);
        }));
        if (self.dataset.to_reorder) {
           val = val.concat(_.map(
                self.dataset.to_reorder, function(x) {
                    return commands.order(x);
                })
            );
        }
        return val.concat(_.map(
            this.dataset.to_delete, function(x) {
                return commands['delete'](x.id);}));
    },
    save_any_view: function() {
        if (this.doing_on_change)
            return false;
        return this.session.synchronized_mode(_.bind(function() {
            if (this.viewmanager && this.viewmanager.views && this.viewmanager.active_view &&
                this.viewmanager.views[this.viewmanager.active_view] &&
                this.viewmanager.views[this.viewmanager.active_view].controller) {
                var view = this.viewmanager.views[this.viewmanager.active_view].controller;
                if (this.viewmanager.active_view === "form") {
                    if (view.is_initialized.state()!=='resolved') {
                        return false;
                    }
                    var res = $.when(view.do_save());
                    if (res.state()!=="resolved" && res.state()!=="rejected") {
                        console.warn("Asynchronous get_value() is not supported in form view.");
                    }
                    return res;
                } else if (this.viewmanager.active_view === "list") {
                    var res = $.Deferred();
                    res.resolve();
                    if (res.state()!=="resolved" && res.state()!=="rejected") {
                        console.warn("Asynchronous get_value() is not supported in list view.");
                    }
                    return false;
                }
            }
            return false;
        }, this));
    },
    is_valid: function() {
        if (!this.viewmanager || !this.viewmanager.views[this.viewmanager.active_view])
            return true;
        var view = this.viewmanager.views[this.viewmanager.active_view].controller;
        switch (this.viewmanager.active_view) {
        case 'form':
            return _(view.fields).chain()
                .invoke('is_valid')
                .all(_.identity)
                .value();
            break;
        case 'list':
            return view.is_valid();
        }
        return true;
    },
    is_dirty: function() {
        this.save_any_view();
        return this._super();
    },
    update_dom: function() {
        this._super.apply(this, arguments);
        var self = this;
        if (this.previous_readonly !== this.is_readonly()) {
            this.previous_readonly = this.is_readonly();
            if (this.viewmanager) {
                this.is_loaded = this.is_loaded.then(function() {
                    self.viewmanager.stop();
                    return $.when(self.load_views()).then(function() {
                        self.reload_current_view();
                    });
                });
            }
        }
    }
});

openerp.web.form.One2ManyDataSet = openerp.web.BufferedDataSet.extend({
    get_context: function() {
        this.context = this.o2m.build_context([this.o2m.name]);
        return this._super.apply(this, arguments);
    }
});

openerp.web.form.One2ManyListView = openerp.web.ListView.extend({
    _template: 'One2Many.listview',
    init: function (parent, dataset, view_id, options) {
        this._super(parent, dataset, view_id, _.extend(options || {}, {
            ListType: openerp.web.form.One2ManyList
        }));
    },
    is_valid: function () {
        var form;
        // A list not being edited is always valid
        if (!(form = this.first_edition_form())) {
            return true;
        }
        // If the form has not been modified, the view can only be valid
        // NB: is_dirty will also be set on defaults/onchanges/whatever?
        // oe_form_dirty seems to only be set on actual user actions
        if (!form.$element.is('.oe_form_dirty')) {
            return true;
        }

        // Otherwise validate internal form
        return _(form.fields).chain()
            .invoke(function () {
                this.validate();
                this.update_dom(true);
                return this.is_valid();
            })
            .all(_.identity)
            .value();
    },
    first_edition_form: function () {
        var get_form = function (group_or_list) {
            if (group_or_list.edition) {
                return group_or_list.edition_form;
            }
            return _(group_or_list.children).chain()
                .map(get_form)
                .compact()
                .first()
                .value();
        };
        return get_form(this.groups);
    },
    do_add_record: function () {
        if (this.options.editable) {
            this._super.apply(this, arguments);
        } else {
            var self = this;
            var pop = new openerp.web.form.SelectCreatePopup(this);
            pop.on_default_get.add(self.dataset.on_default_get);
            pop.select_element(
                self.o2m.field.relation,
                {
                    title: _t("Create: ") + self.name,
                    initial_view: "form",
                    alternative_form_view: self.o2m.field.views ? self.o2m.field.views["form"] : undefined,
                    create_function: function(data, callback, error_callback) {
                        return self.o2m.dataset.create(data).then(function(r) {
                            self.o2m.dataset.set_ids(self.o2m.dataset.ids.concat([r.result]));
                            self.o2m.dataset.on_change();
                        }).then(callback, error_callback);
                    },
                    read_function: function() {
                        return self.o2m.dataset.read_ids.apply(self.o2m.dataset, arguments);
                    },
                    parent_view: self.o2m.view,
                    child_name: self.o2m.name,
                    form_view_options: {'not_interactible_on_create':true}
                },
                self.o2m.build_domain(),
                self.o2m.build_context(),
                self.dataset
            );
            pop.on_select_elements.add_last(function() {
                self.o2m.reload_current_view();
            });
        }
    },
    do_activate_record: function(index, id) {
        var self = this;
        var pop = new openerp.web.form.FormOpenPopup(self.o2m.view);
        pop.show_element(self.o2m.field.relation, id, self.o2m.build_context(), {
            title: _t("Open: ") + self.name,
            auto_write: false,
            alternative_form_view: self.o2m.field.views ? self.o2m.field.views["form"] : undefined,
            parent_view: self.o2m.view,
            child_name: self.o2m.name,
            read_function: function() {
                return self.o2m.dataset.read_ids.apply(self.o2m.dataset, arguments);
            },
            form_view_options: {'not_interactible_on_create':true},
            readonly: self.o2m.is_readonly()
        }, self.o2m.dataset);
        pop.on_write.add(function(id, data, options) {
            self.o2m.dataset.write(id, data, options, function(r) {
                self.o2m.reload_current_view();
            });
        });
    },
    do_button_action: function (name, id, callback) {
        var self = this;
        var _super = _.bind(this._super, this);
        this.o2m.view.do_save().then(function () {
            _super(name, id, callback);
        });
    },
    reload_record: function (record) {
        // Evict record.id from cache to ensure it will be reloaded correctly
        this.dataset.evict_from_cache(record.get('id'));

        return this._super(record);
    }
});

openerp.web.ListFormView = openerp.web.FormView.extend({
    form_template: 'ListView.row.form',
    template: 'EmptyRow',
    init: function(parent, dataset, view_id, options) {
        this._super(parent, dataset, view_id, options);
        this.visible_columns = parent.visible_columns;
        this.embedded_view = parent.embedded_view;
    },
    on_loaded: function(data) {
        var self = this;
        if (data) {
            this.fields_order = [];
            this.fields_view = data;
            var frame = new (openerp.web.form.WidgetFrameList)(this, this.fields_view.arch);

            var rendered = QWeb.render(this.form_template, { 'frame': frame, 'widget': this });
        }
        this.$element.html(rendered);
        this.$element.bind('mousedown.formBlur', function () {
                            self.__clicked_inside = true;
                        })
                     .bind('save_row', self.proxy('on_button_save'));
        _.each(this.widgets, function(w) {
            w.start();
            $(w).bind('widget-focus.formBlur', self.proxy('widgetFocused'))
                .bind('widget-blur.formBlur', self.proxy('widgetBlurred'));
        });
        this.$form_header = this.$element.find('.oe_form_header:first');
        this.$form_header.find('div.oe_form_pager button[data-pager-action]').click(function() {
            var action = $(this).data('pager-action');
            self.on_pager_action(action);
        });
        this.has_been_loaded.resolve();
    },
    widgetBlurred: function() {
        this.$element.removeClass('selected');
        if (this.is_valid()) {
            this.on_button_save();
        }
    },
    widgetFocused: function() {
        var self = this;
        this.$element.addClass('selected');
        self.dataset.index = self.index;
    },
    on_button_save: function() {
        var self = this;
        var result = this.do_save();
        result.done(function () {
            self.index = self.dataset.index;
        });
        return result;
    },
    init_view: function() {
        if (this.embedded_view) {
            var def = $.Deferred().done(this.on_loaded);
            var self = this;
            $.async_when().then(function() {def.resolve(self.embedded_view);});
            return def.promise();
        } else {

            var context = new openerp.web.CompoundContext(this.dataset.get_context());
            return this.rpc("/web/view/load", {
                "model": this.model,
                "view_id": this.view_id,
                "view_type": "tree",
                toolbar: this.options.sidebar,
                context: context
                }, this.on_loaded);
        }
    },
    do_show: function () {
        var self = this;
        this.$element.show().css('visibility', 'hidden');
        this.$element.removeClass('oe_form_dirty');
        return this.has_been_loaded.then(function() {
            var result;
            if (self.index === null) {
                // null index means we should start a new record
                result = self.on_button_new();
            } else {
                self.dataset.index = self.index;
                result = self.dataset.read_index(_.keys(self.fields_view.fields), {
                    context : { 'bin_size' : true }
                }).then(self.on_record_loaded);
            }
            result.then(function() {
                self.$element.css('visibility', 'visible');
            });
            if (self.sidebar) {
                self.sidebar.$element.show();
            }
            return result;
        });
    },
});
openerp.web.form.WidgetFrameList = openerp.web.form.Widget.extend({
    template: 'WidgetFrameList',
    init: function(view, node) {
        var self = this;
        this._super(view, node);
        this.visible_columns = view.visible_columns;
        this.row = [];
        _.each(node.children, function(n) {
            self.handle_node(n);
        });
    },
    start: function() {
        var self = this;
        this._super();
        this.$element.find('button.oe_form_button_save').click(this.on_button_save);
    },
    handle_node: function(node) {
        var type = {};
        if (node.tag == 'field') {
            type = this.view.fields_view.fields[node.attrs.name] || {};
            if (node.attrs.widget == 'statusbar' && node.attrs.nolabel !== '1') {
                // This way we can retain backward compatibility between addons and old clients
                node.attrs.colspan = (parseInt(node.attrs.colspan, 10) || 1) + 1;
                node.attrs.nolabel = '1';
            }
        }
        var widget = new (this.view.registry.get_any(
                [node.attrs.widget, type.type, node.tag])) (this.view, node);
        widget.invisible = widget.modifiers.tree_invisible;
        this.add_widget(widget);
    },
    add_widget: function(widget, colspan) {
        this.row.push(widget);
        return widget;
    }
});
openerp.web.form.One2ManyList = openerp.web.ListView.List.extend({
    KEY_RETURN: 13,
    // blurring caused by hitting the [Return] key, should skip the
    // autosave-on-blur and let the handler for [Return] do its thing
    __return_blur: false,
    render_row_as_form: function () {
        var self = this;
        return this._super.apply(this, arguments).then(function () {
            // Replace form's do_execute_action by a call to listview's:
            // because the form view is actually destroyed at one point, the
            // RPC request to load&execute the action may get dropped on the
            // floor in some cases (core.js:1173) leading to the flow not
            // terminating for complex cases (a button of type action, which
            // needs 2 or 3 RPC roundtrip to execute the action fully).
            // => because do_execute_action really is on View, use the
            // listview's
            self.edition_form.do_execute_action = function (action, dataset, record_id, _callback) {
                return self.view.do_execute_action(action, dataset, record_id, function () {
                    self.view.reload_record(
                        self.view.records.get(record_id));
                });
            };
            self.edition_form.$element.bind('focusout', function () {
                if (self.__return_blur) {
                    delete self.__return_blur;
                    return;
                }
                if (self.edition_form && !self.edition_form.widget_is_stopped) {
                    self.view.ensure_saved();
                }
            });
            $(self.edition_form).bind('form-blur', function () {
                if (self.__return_blur) {
                    delete self.__return_blur;
                    return;
                }
                if (self.edition_form && !self.edition_form.widget_is_stopped) {
                    self.view.ensure_saved();
                }
            });
        });
    },
    move_lines: function(index_pos, do_prepend_lines) {
        var self = this;
        self._super(index_pos, do_prepend_lines);
        self.dataset.on_change();
    },
    on_row_keyup: function (e) {
        if (e.which === this.KEY_RETURN) {
            this.__return_blur = true;
        }
        this._super(e);
    }
});

openerp.web.form.One2ManyFormView = openerp.web.FormView.extend({
    form_template: 'One2Many.formview',
    on_loaded: function(data) {
        this._super(data);
        var self = this;
        this.$form_header.find('button.oe_form_button_create').click(function() {
            self.do_save().then(self.on_button_new);
        });
    },
    do_notify_change: function() {
        if (this.dataset.parent_view) {
            this.dataset.parent_view.do_notify_change();
        } else {
            this._super.apply(this, arguments);
        }
    }
});

openerp.web.form.FieldMany2Many = openerp.web.form.Field.extend({
    template: 'FieldMany2Many',
    multi_selection: false,
    init: function(view, node) {
        this._super(view, node);
        this.list_id = _.uniqueId("many2many");
        this.is_loaded = $.Deferred();
        this.initial_is_loaded = this.is_loaded;
        this.is_setted = $.Deferred();
    },
    start: function() {
        this._super.apply(this, arguments);

        var self = this;

        this.dataset = new openerp.web.form.Many2ManyDataSet(this, this.field.relation);
        this.dataset.m2m = this;
        this.dataset.on_unlink.add_last(function(ids) {
            self.on_ui_change();
        });

        this.is_setted.then(function() {
            self.load_view();
        });
    },
    set_value: function(value) {
        value = value || [];
        if (value.length >= 1 && value[0] instanceof Array) {
            value = value[0][2];
        }
        this._super(value);
        this.dataset.set_ids(value);
        var self = this;
        self.reload_content();
        this.is_setted.resolve();
    },
    set_value_list: function(value) {
        var self = this;
        value = value || [];
        if (value.length >= 1 && value[0] instanceof Array) {
            value = value[0][2];
        }
        if (self.view.datarecord[self.name]!==value) {
            self.dataset.set_ids(value);
        }
        else {
            self.update_dom();
            self.value = value;
        }
    },
    get_value: function() {
        return [commands.replace_with(this.dataset.ids)];
    },
    validate: function() {
        this.invalid = this.required && _(this.dataset.ids).isEmpty();
    },
    is_readonly: function() {
        return this.readonly || this.force_readonly || (this.widget_parent && this.widget_parent.is_readonly && this.widget_parent.is_readonly());
    },
    load_view: function() {
        var self = this;
        this.list_view = new openerp.web.form.Many2ManyListView(this, this.dataset, false, {
                    'addable': self.is_readonly() ? null : _t("Add"),
                    'deletable': self.is_readonly() ? false : true,
                    'selectable': self.is_readonly() ? false : true,
                    'isClarkGable': self.is_readonly() ? false : true
            });
        var embedded = (this.field.views || {}).tree;
        if (embedded) {
            this.list_view.set_embedded_view(embedded);
        }
        this.list_view.m2m_field = this;
        var loaded = $.Deferred();
        this.list_view.on_loaded.add_last(function() {
            self.initial_is_loaded.resolve();
            loaded.resolve();
        });
        $.async_when().then(function () {
            self.list_view.appendTo($("#" + self.list_id));
        });
        return loaded;
    },
    reload_content: function() {
        var self = this;
        this.is_loaded = this.is_loaded.then(function() {
            return self.list_view.reload_content();
        });
    },
    update_dom: function() {
        this._super.apply(this, arguments);
        var self = this;
        if (this.previous_readonly !== this.is_readonly()) {
            this.previous_readonly = this.is_readonly();
            if (this.list_view) {
                this.is_loaded = this.is_loaded.then(function() {
                    self.list_view.stop();
                    return $.when(self.load_view()).then(function() {
                        self.reload_content();
                    });
                });
            }
        }
    }
});

openerp.web.form.Many2ManyDataSet = openerp.web.DataSetStatic.extend({
    get_context: function() {
        this.context = this.m2m.build_context();
        return this.context;
    }
});

/**
 * @class
 * @extends openerp.web.ListView
 */
openerp.web.form.Many2ManyListView = openerp.web.ListView.extend(/** @lends openerp.web.form.Many2ManyListView# */{
    do_add_record: function () {
        var pop = new openerp.web.form.SelectCreatePopup(this);
        pop.select_element(
            this.model,
            {
                title: _t("Add: ") + this.name
            },
            new openerp.web.CompoundDomain(this.m2m_field.build_domain(), ["!", ["id", "in", this.m2m_field.dataset.ids]]),
            this.m2m_field.build_context()
        );
        var self = this;
        pop.on_select_elements.add(function(element_ids) {
            _.each(element_ids, function(element_id) {
                if(! _.detect(self.dataset.ids, function(x) {return x == element_id;})) {
                    self.dataset.set_ids([].concat(self.dataset.ids, [element_id]));
                }
            });
            self.m2m_field.on_ui_change();
            self.reload_content();
        });
    },
    do_activate_record: function(index, id) {
        var self = this;
        var pop = new openerp.web.form.FormOpenPopup(this);
        pop.show_element(this.dataset.model, id, this.m2m_field.build_context(), {
            title: _t("Open: ") + this.name,
            readonly: this.widget_parent.is_readonly()
        }, self.dataset);
        pop.on_write_completed.add_last(function() {
            self.reload_content();
        });
    }
});

/**
 * @class
 * @extends openerp.web.OldWidget
 */
openerp.web.form.SelectCreatePopup = openerp.web.OldWidget.extend(/** @lends openerp.web.form.SelectCreatePopup# */{
    template: "SelectCreatePopup",
    /**
     * options:
     * - initial_ids
     * - initial_view: form or search (default search)
     * - disable_multiple_selection
     * - alternative_form_view
     * - create_function (defaults to a naive saving behavior)
     * - parent_view
     * - child_name
     * - form_view_options
     * - list_view_options
     * - read_function
     */
    select_element: function(model, options, domain, context, dataset) {
        var self = this;
        this.model = model;
        this.dataset = dataset;
        this.domain = domain || [];
        this.context = context || {};
        this.options = _.defaults(options || {}, {"initial_view": "search", "create_function": function() {
            return self.create_row.apply(self, arguments);
        }, read_function: null});
        this.initial_ids = this.options.initial_ids;
        this.created_elements = [];
        this.render_element();
        openerp.web.form.dialog(this.$element, {
            close: function() {
                self.check_exit();
            },
            title: options.title || ""
        });
        this.start();
    },
    start: function() {
        this._super();
        var self = this;
        if (!this.dataset) {
            this.dataset = new openerp.web.ProxyDataSet(this, this.model, this.context);
            this.dataset.on_default_get.add(this.on_default_get);
        }
        this.dataset.create_function = function() {
            var d = new $.Deferred();
            return self.options.create_function.apply(null, arguments).done(function(r) {
                d.resolve(self.created_elements.push(r.result));
            });
                return d.promise();
        };
        this.dataset.write_function = function() {
            return self.write_row.apply(self, arguments);
        };
        this.dataset.read_function = this.options.read_function;
        this.dataset.parent_view = this.options.parent_view;
        this.dataset.child_name = this.options.child_name;
        if (this.options.initial_view == "search") {
            self.rpc('/web/session/eval_domain_and_context', {
                domains: [],
                contexts: [this.context]
            }, function (results) {
                var search_defaults = {};
                _.each(results.context, function (value, key) {
                    var match = /^search_default_(.*)$/.exec(key);
                    if (match) {
                        search_defaults[match[1]] = value;
                    }
                });
                self.setup_search_view(search_defaults);
            });
        } else { // "form"
            this.new_object();
        }
    },
    stop: function () {
        try {
            !!this.$element.data('ui-dialog') && this.$element.dialog('destroy');
            // !!this.$element.data('ui-dialog') && this.$element.dialog('close');
            if (this.dataset.parent_view) {
                this.dataset.parent_view.do_save();
            }
            this._super();
        } catch(err) { console.warn(err); }
    },
    setup_search_view: function(search_defaults) {
        var self = this;
        if (this.searchview) {
            this.searchview.stop();
        }
        this.searchview = new openerp.web.SearchView(this,
                this.dataset, false,  search_defaults);
        this.searchview.on_search.add(function(domains, contexts, groupbys) {
            if (self.initial_ids) {
                self.do_search(domains.concat([[["id", "in", self.initial_ids]], self.domain]),
                    contexts, groupbys);
                self.initial_ids = undefined;
            } else {
                self.do_search(domains.concat([self.domain]), contexts.concat(self.context), groupbys);
            }
        });
        this.searchview.on_loaded.add_last(function () {
            self.view_list = new openerp.web.form.SelectCreateListView(self,
                    self.dataset, false,
                    _.extend({'deletable': false,
                        'selectable': !self.options.disable_multiple_selection
                    }, self.options.list_view_options || {}));
            self.view_list.popup = self;
            self.view_list.appendTo($("#" + self.element_id + "_view_list")).then(function() {
                self.view_list.do_show();
            }).then(function() {
                self.searchview.do_search();
            });
            self.view_list.on_loaded.add_last(function() {
                var $buttons = self.view_list.$element.find(".oe-actions");
                $buttons.prepend(QWeb.render("SelectCreatePopup.search.buttons"));
                var $cbutton = $buttons.find(".oe_selectcreatepopup-search-close");
                $cbutton.click(function() {
                    self.stop();
                });
                var $sbutton = $buttons.find(".oe_selectcreatepopup-search-select");
                if(self.options.disable_multiple_selection) {
                    $sbutton.hide();
                }
                $sbutton.click(function() {
                    self.on_select_elements(self.selected_ids);
                    self.stop();
                });
            });
        });
        this.searchview.appendTo($("#" + this.element_id + "_search"));
    },
    do_search: function(domains, contexts, groupbys) {
        var self = this;
        this.rpc('/web/session/eval_domain_and_context', {
            domains: domains || [],
            contexts: contexts || [],
            group_by_seq: groupbys || []
        }, function (results) {
            self.view_list.do_search(results.domain, results.context, results.group_by);
        });
    },
    create_row: function() {
        var self = this, d = new $.Deferred();
        var wdataset = new openerp.web.DataSetSearch(this, this.model, this.context, this.domain);
        wdataset.parent_view = this.options.parent_view;
        wdataset.child_name = this.options.child_name;
        wdataset.create.apply(wdataset, arguments).then(function(r){
            d.resolve(r);
        });
        return d;
    },
    write_row: function() {
        var self = this;
        var wdataset = new openerp.web.DataSetSearch(this, this.model, this.context, this.domain);
        wdataset.parent_view = this.options.parent_view;
        wdataset.child_name = this.options.child_name;
        return wdataset.write.apply(wdataset, arguments);
    },
    on_select_elements: function(element_ids) {
    },
    on_click_element: function(ids) {
        this.selected_ids = ids || [];
        if(this.selected_ids.length > 0) {
            this.$element.find(".oe_selectcreatepopup-search-select").removeAttr('disabled');
        } else {
            this.$element.find(".oe_selectcreatepopup-search-select").attr('disabled', "disabled");
        }
    },
    new_object: function() {
        var self = this;
        if (this.searchview) {
            this.searchview.hide();
        }
        if (this.view_list) {
            this.view_list.$element.hide();
        }
        this.dataset.index = null;
        this.options.form_view_options = {pager: false};
        this.view_form = new openerp.web.FormView(this, this.dataset, false, self.options.form_view_options);
        if (this.options.alternative_form_view) {
            this.view_form.set_embedded_view(this.options.alternative_form_view);
        }
        this.view_form.appendTo(this.$element.find("#" + this.element_id + "_view_form"));
        this.view_form.on_loaded.add_last(function() {
            var $buttons = self.view_form.$element.find(".oe_form_buttons");
            $buttons.html(QWeb.render("SelectCreatePopup.form.buttons", {widget:self}));
            var $nbutton = $buttons.find(".oe_selectcreatepopup-form-save-new");
            $nbutton.click(function() {
                if (!_.any(self.view_form.dataset.ids,function(id) {return id===self.view_form.datarecord.id}))
                    self.view_form.datarecord.id = null;
                self.view_form.do_save().done(function() {
                    self.view_form.reload_mutex.exec(function() {
                        self.view_form.on_button_new();
                    });
                });
            });
            var $nbutton = $buttons.find(".oe_selectcreatepopup-form-save");
            $nbutton.click(function() {
                if (!_.any(self.view_form.dataset.ids,function(id) {return id ===self.view_form.datarecord.id}))
                    self.view_form.datarecord.id = null;
                self.view_form.do_save().done(function() {
                    self.view_form.reload_mutex.exec(function() {
                        self.check_exit();
                    });
                });
            });
            var $cbutton = $buttons.find(".oe_selectcreatepopup-form-close");
            $cbutton.click(function() {
                self.check_exit();
            });
        });
        this.view_form.do_show();
    },
    check_exit: function() {
        if (this.created_elements.length > 0) {
            this.on_select_elements(this.created_elements);
        }
        this.stop();
    },
    on_default_get: function(res) {}
});

openerp.web.form.SelectCreateListView = openerp.web.ListView.extend({
    do_add_record: function () {
        this.popup.new_object();
    },
    select_record: function(index) {
        this.popup.on_select_elements([this.dataset.ids[index]]);
        this.popup.stop();
    },
    do_select: function(ids, records) {
        this._super(ids, records);
        this.popup.on_click_element(ids);
    }
});

/**
 * @class
 * @extends openerp.web.OldWidget
 */
openerp.web.form.FormOpenPopup = openerp.web.OldWidget.extend(/** @lends openerp.web.form.FormOpenPopup# */{
    template: "FormOpenPopup",
    /**
     * options:
     * - alternative_form_view
     * - auto_write (default true)
     * - read_function
     * - parent_view
     * - child_name
     * - form_view_options
     * - readonly
     */
    show_element: function(model, row_id, context, options, dataset) {
        this.model = model;
        this.row_id = row_id;
        this.dataset = dataset
        this.context = context || {};
        this.options = _.defaults(options || {}, {"auto_write": true});
        this.render_element();
        this.$element.dialog({
            title: options.title || '',
            modal: true,
            width: 960,
            height: 600
        }).dialogExtend({
            'maximize': true,
        });
        this.start();
    },
    start: function() {
        var self = this;
        this._super();
        this.dataset.index = _.indexOf(self.dataset.ids, self.row_id);
        this.dataset.parent_view = this.options.parent_view;
        this.dataset.child_name = this.options.child_name;
        this.setup_form_view();
        try {
            var main_form = self.dataset.widget_parent.widget_parent.widget_parent.widget_parent.widget_parent;
            if (typeof(main_form.dialog_par)=='undefined') main_form.dialog_par=[];
            main_form.dialog_par.push(self);
        }
        catch(err) {console.warn(err);}
    },
    on_write: function(id, data, options) {
        if (!this.options.auto_write)
            return;
        var self = this;
        var wdataset = new openerp.web.DataSetSearch(this, this.model, this.context, this.domain);
        wdataset.parent_view = this.options.parent_view;
        wdataset.child_name = this.options.child_name;
        wdataset.write(id, data, options, function(r) {self.on_write_completed();});
        wdataset.write(id, data, options, function(r) {
            self.on_write_completed();
        });
    },
    on_action_executed: function () {
        var self=this;
        var rec_id = self.view_form.datarecord.id,
            data_ids = self.view_form.dataset.ids,
            dataset_index = self.view_form.dataset.index,
            datarec  = self.view_form.datarecord,
            dialog_par;
        if (typeof(self.dialog_par)!=='undefined') {
            dialog_par = _.last(self.dialog_par);
            // if (self.dialog_par.length>1) self.dialog_par.splice(0,this.length-2);
            dialog_record = dialog_par.view_form.datarecord;
            dialog_par.view_form.dataset.index = dialog_par.view_form.dataset.ids.indexOf(dialog_par.view_form.datarecord.id);
        }
        if (this.widget_parent)
            return $.when(self.widget_parent.do_show()).done(function() {
                if (self.dataset.widget_parent && self.dataset.widget_parent.view) {self.dataset.widget_parent.view.remove_from_confirm_reload();}
                else {self.on_write_completed();}
                self.dataset.index = data_ids.indexOf(rec_id);
                // if (self.dialog_par.length>0) {return true}
                //     else { self.view_form.reload();}
                return true
            });
    },
    on_write_completed: function() {},
    setup_form_view: function() {
        var self = this;
        var FormClass = this.options.readonly
                ? openerp.web.views.get_object('page')
                : openerp.web.views.get_object('form');
        this.view_form = new FormClass(this, this.dataset, false, self.options.form_view_options);
        if (this.options.alternative_form_view) {
            this.view_form.set_embedded_view(this.options.alternative_form_view);
        }
        this.view_form.appendTo(this.$element.find("#" + this.element_id + "_view_form"));
        this.view_form.on_loaded.add_last(function() {
            var $buttons = self.view_form.$element.find(".oe_form_buttons");
            $buttons.html(QWeb.render("FormOpenPopup.form.buttons"));
            var $nbutton = $buttons.find(".oe_formopenpopup-form-save");
            $nbutton.click(function() {
                $.when(self.view_form.do_save()).done(function() {
                    var rez = (self.dataset.o2m && self.dataset.o2m.reload_current_view()) || (self.dataset.m2m && self.dataset.m2m.reload_content()) || true;
                    $.when(rez).then(function(){self.stop()});
                });
            });
            var $cbutton = $buttons.find(".oe_formopenpopup-form-close");
            $cbutton.click(function() {
                self.stop();
            });
            if (self.options.readonly) {
                $nbutton.hide();
                $cbutton.attr('title',_t("Close"));
            }
            self.$element.parent().find('a.ui-dialog-titlebar-close').bind('click',function(event){
                self.stop();
            });
            self.view_form.do_show();
        });
    },
    update_dom: function() {
    },
    stop: function() {
        var self= this;
        if (!!this.dataset.parent_view)
        with (this.dataset.parent_view.widget_parent.widget_parent){
            if (typeof(dialog_par)!=='undefined' && dialog_par.length>0) {
                dialog_par.splice(dialog_par.indexOf(_.last(dialog_par.filter(function(d) {return d.element_id===self.element_id}))),1);
            }
        }
        this.$element.dialog('destroy');
        this._super();
    },
});

openerp.web.form.FieldReference = openerp.web.form.Field.extend({
    template: 'FieldReference',
    init: function(view, node) {
        this._super(view, node);
        this.fields_view = {
            fields: {
                selection: {
                    selection: view.fields_view.fields[this.name].selection
                },
                m2o: {
                    relation: null
                }
            }
        };
        this.get_fields_values = view.get_fields_values;
        this.get_selected_ids = view.get_selected_ids;
        this.do_onchange = this.on_form_changed = this.do_notify_change = this.on_nop;
        this.dataset = this.view.dataset;
        this.widgets_counter = 0;
        this.view_id = 'reference_' + _.uniqueId();
        this.widgets = {};
        this.fields = {};
        this.fields_order = [];
        this.selection = new openerp.web.form.FieldSelection(this, { attrs: {
            name: 'selection',
            widget: 'selection'
        }});
        this.reference_ready = true;
        this.selection.on_value_changed.add_last(this.on_selection_changed);
        this.m2o = new openerp.web.form.FieldMany2One(this, { attrs: {
            name: 'm2o',
            widget: 'many2one'
        }});
        this.m2o.on_ui_change.add_last(this.on_ui_change);
    },
    on_nop: function() {
    },
    on_selection_changed: function() {
        if (this.reference_ready) {
            var sel = this.selection.get_value();
            this.m2o.field.relation = sel;
            this.m2o.set_value(null);
            this.m2o.$element.toggle(sel !== false);
        }
    },
    start: function() {
        var self = this;
        this._super();
        this.selection.start();
        this.m2o.start();
        $(this.selection).add($(this.m2o)).bind({
            'focus': function () { $(self).trigger('widget-focus'); },
            'blur': function () { $(self).trigger('widget-blur'); }
        })
    },
    is_valid: function() {
        return this.required === false || typeof(this.get_value()) === 'string';
    },
    is_dirty: function() {
        return this.selection.is_dirty() || this.m2o.is_dirty();
    },
    set_value: function(value) {
        this._super(value);
        this.reference_ready = false;
        var vals = [], sel_val, m2o_val;
        if (typeof(value) === 'string') {
            vals = value.split(',');
        }
        sel_val = vals[0] || false;
        m2o_val = vals[1] ? parseInt(vals[1], 10) : false;
        this.selection.set_value(sel_val);
        this.m2o.field.relation = sel_val;
        this.m2o.set_value(m2o_val);
        this.m2o.$element.toggle(sel_val !== false);
        this.reference_ready = true;
    },
    get_value: function() {
        var model = this.selection.get_value(),
            id = this.m2o.get_value();
        if (typeof(model) === 'string' && typeof(id) === 'number') {
            return model + ',' + id;
        } else {
            return false;
        }
    }
});

openerp.web.form.FieldBinary = openerp.web.form.Field.extend({
    init: function(view, node) {
        this._super(view, node);
        this.iframe = this.element_id + '_iframe';
        this.binary_value = false;
    },
    start: function() {
        var self = this;
        this._super.apply(this, arguments);
        if (this.field.uploadfolder) {
            self.$element.on('change', 'input.oe-binary-file', self.do_upload);
        }
        else {
            this.$element.find('input.oe-binary-file').change(this.on_file_change).click(this.on_file_change);
        }
        this.$element.find('button.oe-binary-file-save').click(this.on_save_as);
        this.$element.find('.oe-binary-file-clear').click(this.on_clear);
        this.$element.find('.oe-binary-file-open').click(this.on_file_open);
        self.$element.on('change', 'input.oe-binary-file12', self.on_file_change);
        self.$field_image = self.$element.find('input.field_image');
    },
    human_filesize : function(size) {
        var units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
        var i = 0;
        while (size >= 1024) {
            size /= 1024;
            ++i;
        }
        return size.toFixed(2) + ' ' + units[i];
    },
    on_file_open: function() {
        var self = this,
            filename = (this.node.attrs.filename || ''),
            data = {data: JSON.stringify({
                model: this.view.dataset.model,
                id: (this.view.datarecord.id || ''),
                field: this.name,
                filename_field: filename
            })},
            file_title = (self.view.datarecord[filename] || 'UnknownFilename'),
            url = '/web/binary/open_file/' + file_title + '?data=' + encodeURI(data.data) + '&session_id=' + self.session.session_id;
            window.open(url, file_title);
    },
    on_file_change: function(e) {
        // TODO: on modern browsers, we could directly read the file locally on client ready to be used on image cropper
        // http://www.html5rocks.com/tutorials/file/dndfiles/
        // http://deepliquid.com/projects/Jcrop/demos.php?demo=handler
        window[this.iframe] = this.on_file_uploaded;
        this.on_ui_change();
        if ($(e.target).val() != '') {
            this.$element.find('form.oe-binary-form input[name=session_id]').val(this.session.session_id);
            this.$element.find('form.oe-binary-form').submit();
            this.$element.find('.oe-binary-progress').show();
            this.$element.find('.oe-binary').hide();
        }
    },
    do_upload: function(e) {
        var self = this;
        this.$element.find('input[name="session_id"]').val(self.session.session_id);
        var formData = new FormData(self.$element.find('form')[0]);
        formData.append('active_id', self.view.datarecord.id);
        formData.append('field_name', self.name);
        formData.append('uploadfolder', self.field.uploadfolder);
        formData.append('active_model', self.view.dataset.model);
        formData.append('values', JSON.stringify(self.view.get_fields_values()));
        $.ajax({
            url: '/web/binary/upload_image',  //Server script to process data
            type: 'POST',
            xhr: function() {  // Custom XMLHttpRequest
                var myXhr = $.ajaxSettings.xhr();
                if(myXhr.upload){ // Check if upload property exists
                    myXhr.upload.addEventListener('progress',progressHandlingFunction, false); // For handling the progress of the upload
                }
                return myXhr;
            },
            //Ajax events
            success: function(response) {
                self.on_image_uploaded(response);
                self.on_ui_change();
            },
            //error: errorHandler,
            // Form data
            data: formData,
            //Options to tell jQuery not to process data or worry about content-type.
            cache: false,
            contentType: false,
            processData: false
        }).done(function(link){
            dirs = link.split('/')
            show_value = dirs[dirs.length - 1];
            self.$element.find('input').eq(0).val(show_value);
        });
        function progressHandlingFunction(e){
            if(e.lengthComputable){
                $('progress').attr({value:e.loaded,max:e.total});
            }
        }
    },
    on_image_uploaded: function(response) {
        var self = this;
        self.set_value(response);
    },
    on_file_uploaded: function(size, name, content_type, file_base64) {
        delete(window[this.iframe]);
        if (size === false) {
            this.do_warn(_t("File Upload"), _t("There was a problem while uploading your file"));
            // TODO: use openerp web crashmanager
            console.warn("Error while uploading file : ", name);
        } else {
            this.on_file_uploaded_and_valid.apply(this, arguments);
            this.on_ui_change();
        }
        this.$element.find('.oe-binary-progress').hide();
        this.$element.find('.oe-binary').show();
    },
    on_file_uploaded_and_valid: function(size, name, content_type, file_base64) {
    },
    on_save_as: function() {
        $.blockUI();
        this.session.get_file({
            url: '/web/binary/saveas_ajax',
            data: {data: JSON.stringify({
                model: this.view.dataset.model,
                id: (this.view.datarecord.id || ''),
                field: this.name,
                filename_field: (this.node.attrs.filename || ''),
                context: this.view.dataset.get_context()
            })},
            complete: $.unblockUI,
            error: openerp.webclient.crashmanager.on_rpc_error
        });
    },
    set_filename: function(value) {
        var filename = this.node.attrs.filename;
        if (this.view.fields[filename]) {
            this.view.fields[filename].set_value(value);
            this.view.fields[filename].on_ui_change();
        }
    },
    on_clear: function() {
        if (this.value !== false) {
            this.value = false;
            this.binary_value = false;
            this.$element.find('form.oe-binary-form').find('[type="file"]').val('');
            this.on_ui_change();
            this.$element.find('form.oe-binary-form').submit();
        }
        return false;
    },
});

openerp.web.form.FieldBinaryFile = openerp.web.form.FieldBinary.extend({
    template: 'FieldBinaryFile',
    update_dom: function() {
        this._super.apply(this, arguments);
        this.$element.find('.oe-binary-file-set, .oe-binary-file-clear').toggle(!this.is_readonly());
        this.$element.find('input[type=text]').prop('readonly', this.is_readonly());
    },
    set_value: function(value) {
        this._super.apply(this, arguments);
        var show_value;
        if (this.node.attrs.filename) {
            show_value = this.view.datarecord[this.node.attrs.filename] || '';
        } else {
            show_value = (value != null && value !== false) ? value : '';
        }
        if (!show_value && value) {
            dirs = value.split('/')
            show_value = dirs[dirs.length - 1];
        }
        this.$element.find('input').eq(0).val(show_value);
    },
    on_file_uploaded_and_valid: function(size, name, content_type, file_base64) {
        this.value = file_base64;
        this.binary_value = true;
        var show_value = name + " (" + this.human_filesize(size) + ")";
        this.$element.find('input').eq(0).val(show_value);
        this.set_filename(name);
    },
    on_clear: function() {
        this._super.apply(this, arguments);
        this.$element.find('input').eq(0).val('');
        this.set_filename('');
    }
});

openerp.web.form.FieldBinaryImage = openerp.web.form.FieldBinary.extend({
    template: 'FieldBinaryImage',
    start: function() {
        var self = this;
        this._super.apply(this, arguments);
        this.$image = this.$element.find('img.oe-binary-image');
        // this.$image = this.$element.find('.image_link img');
        this.$input = this.$element.find("input[type='text']");
        self.$img = self.$element.find('img');
        //self.$img[0].style.display = 'none';
        self.$lock = self.$element.find('span.qty_locker');
        self.$lock.click(function(e) {
            self.toggle_lock(e);
        });
        self.$image_open = self.$element.find('span.ea_gallery_button');
        self.$image_open.click(function(e) {
            self.open_image_picker(e);
        });
    },
    update_dom: function() {
        var self = this;
        this._super.apply(this, arguments);
        this.$element.find('.oe-binary').toggle(!this.is_readonly());
    },
    set_value: function(value) {
        var self = this;
        this._super.apply(this, arguments);
        this.set_image_maxwidth();
        if (self.field.uploadfolder) {
            var url = '/web/binary/get/' + value + '?db=' + self.session.db;
        }
        else {
            var url = '/web/binary/image?session_id=' + this.session.session_id + '&model=' +
                this.view.dataset.model +'&id=' + (this.view.datarecord.id || '') + '&field=' + this.name + '&t=' + (new Date().getTime());
        }
        if (value == 'false' || value == false) {
            var res = ''
        }
        else {
            var res = value || ''
        }
        this.$input.val(res);
        this.$image.attr('src', url);
    },
    set_image_maxwidth: function() {
        this.$image.css('max-width', Math.min(this.$image.innerWidth(),this.$element.innerWidth()));
    },
    on_file_uploaded_and_valid: function(size, name, content_type, file_base64) {
        var self = this;
        this.value = file_base64;
        this.binary_value = true;
        if (self.field.uploadfolder == null) {
            this.$image.attr('src', 'data:' + (content_type || 'image/png') + ';base64,' + file_base64);
        }
        this.set_filename(name);
    },
    on_clear: function() {
        this._super.apply(this, arguments);
        this.$image.attr('src', '/web/static/src/img/placeholder.png');
        this.set_filename('');
    },
    toggle_lock: function(e) {
        var self = this;
        self.$lock.toggleClass('icon-lock icon-unlock');
        self.widget_parent.widgets[self.name + '_lock'].set_value(!self.widget_parent.widgets[self.name + '_lock'].value);
        self.widget_parent.do_save_line();
    },
    open_image_picker: function(e) {
        var self = this;
        if (self.field.uploadfolder) {
            var image_path = this.$element.find("input[type='text']").val();
        }
        else {
            var image_path = self.get_value() || '';
        }
        image_path = image_path.replace(/^\//, '');
        self.image_dialog = new openerp.web.ImagePicker(image_path, self.field.image_size);
        self.image_dialog.parent = self;
        self.image_dialog.open();
    },
});

openerp.web.ImagePicker = openerp.web.Dialog.extend({
    template: 'ImagePicker',
    init: function(path, image_size) {
        var self = this;
        self._super();
        self.current_image_path = path;
        self.image_size = image_size;
        self.set_dir(path);
        self.$element.delegate(':input', 'keypress', function(e){
            if (e.which == 13) {
                self.set_dir(self.$element.find('input[name="current_image_path"]').val());
            }
        });
        self.$element.delegate(':button', 'click', function(){
            var formData = new FormData(self.$element.find('form')[0]);
            formData.append('relative_dir', self.relative_dir);
            $.ajax({
                url: '/web/images_list/upload',  //Server script to process data
                type: 'POST',
                xhr: function() {  // Custom XMLHttpRequest
                    var myXhr = $.ajaxSettings.xhr();
                    if(myXhr.upload){ // Check if upload property exists
                        myXhr.upload.addEventListener('progress',progressHandlingFunction, false); // For handling the progress of the upload
                    }
                    return myXhr;
                },
                //Ajax events
                success: function(response) {
                    self.complete_upload(response);
                },
                //error: errorHandler,
                // Form data
                data: formData,
                //Options to tell jQuery not to process data or worry about content-type.
                cache: false,
                contentType: false,
                processData: false
            });
        function progressHandlingFunction(e){
            if(e.lengthComputable){
                $('progress').attr({value:e.loaded,max:e.total});
            }
        }
        });
    },
    complete_upload: function(response) {
        var self = this;
        if (response) {
            self.set_dir(self.relative_dir);
            self.set_file(response);
        }
    },
    set_dir: function(path) {
        var self = this;
        self.rpc('/web/images_list/get', {
            path: path,
            image_size: self.image_size,
        }, function () { }).then(function (response) {
            self.render_dir(response);
        }, function () {
        });
    },
    set_file: function(file_name){
        var self = this;
        self.$element.find('input[name="current_image_path"]').val(file_name);
    },
    on_close: function(e) {
        var self = this;
        self.parent.set_value(self.$element.find('input[name="current_image_path"]').val());
        self.parent.on_ui_change();
    },
    join_path: function(directory_name, file_name) {
        return directory_name && directory_name + '/' + file_name || file_name;
    },
    render_dir: function(response) {
        var self = this;
        file_path = self.join_path(response.dir_path, response.file_path);
        self.set_file(file_path);
        self.relative_dir = response.dir_path;
        self.parent_dir = response.parent_dir;
        self.directory_list && self.directory_list.stop();
        self.directory_list = new openerp.web.ImagePicker.directory_list(response.directories);
        self.directory_list.picker = self;
        self.directory_list.appendTo(self.$element.find('.image_picker'));
        self.file_list && self.file_list.stop();
        self.file_list = new openerp.web.ImagePicker.file_list(response.files);
        self.file_list.picker = self;
        self.file_list.appendTo(self.$element.find('.image_picker'));
    }
});

openerp.web.ImagePicker.List = openerp.web.Widget.extend({
    init: function(item_list) {
        var self = this;
        self._super();
        self.item_objects = [];
        _.each(item_list, function(item_path) {
            var name = _.first(item_path.split('?'));
            if (name.substr(-1) == '/') {
                var name = name.substr(0, name.length - 1);
            };
            self.item_objects.push({
                'name': _.last(name.split('/')),
                'path': item_path
            });
        });
    },

})

openerp.web.ImagePicker.directory_list = openerp.web.ImagePicker.List.extend({
    template: 'ImagePickerDirectoryList',
    start: function(dir_list) {
        var self = this;
        self._super();
        self.$element
        .delegate('li', 'click', function(e) {
            self.on_dir_clicked(e);
        });
    },
    on_dir_clicked: function(e) {
        var self = this;
        self.picker.set_dir(e.target.attributes.title.value);
    }
});

openerp.web.ImagePicker.file_list = openerp.web.ImagePicker.List.extend({
    template: 'ImagePickerFileList',
    start: function(file_list) {
        var self = this;
        self._super();
        self.$element
        .delegate('div', 'click', function(e) {
            self.on_file_clicked(e);
        })
        .delegate('div', 'dblclick', function(e) {
            self.on_file_dblclicked(e);
        });
    },
    on_file_clicked: function(e) {
        var self = this;
        self.$element.find('div').removeClass('selected');
        $(e.currentTarget).addClass('selected');
    },
    on_file_dblclicked: function(e) {
        var self = this;
        var current_file = e.currentTarget.innerText;
        var current_image_path = self.picker.$element.find('input[name="current_image_path"]').val();
        self.on_file_clicked(e);
        var file_name = self.picker.join_path(current_image_path.slice(0, current_image_path.length - 1), e.currentTarget.innerText);
        self.picker.set_file(file_name);
        self.picker.close();
    }
});

openerp.web.form.FieldStatus = openerp.web.form.Field.extend({
    template: "EmptyComponent",
    start: function() {
        this._super();
        this.selected_value = null;

        this.render_list();
    },
    set_value: function(value) {
        this._super(value);
        this.selected_value = value;

        this.render_list();
    },
    render_list: function() {
        var self = this;
        var shown = _.map(((this.node.attrs || {}).statusbar_visible || "").split(","),
            function(x) { return _.str.trim(x); });
        shown = _.select(shown, function(x) { return x.length > 0; });

        if (shown.length == 0) {
            this.to_show = this.field.selection;
        } else {
            this.to_show = _.select(this.field.selection, function(x) {
                return _.indexOf(shown, x[0]) !== -1 || x[0] === self.selected_value;
            });
        }

        var content = openerp.web.qweb.render("FieldStatus.content", {widget: this, _:_});
        this.$element.html(content);

        var colors = JSON.parse((this.node.attrs || {}).statusbar_colors || "{}");
        var color = colors[this.selected_value];
        if (color) {
            var elem = this.$element.find("li.oe-arrow-list-selected span");
            elem.css("border-color", color);
            if (this.check_white(color))
                elem.css("color", "white");
            elem = this.$element.find("li.oe-arrow-list-selected .oe-arrow-list-before");
            elem.css("border-left-color", "transparent");
            elem = this.$element.find("li.oe-arrow-list-selected .oe-arrow-list-after");
            elem.css("border-color", "transparent");
            elem.css("border-left-color", color);
        }
    },
    check_white: function(color) {
        var div = $("<div></div>");
        div.css("display", "none");
        div.css("color", color);
        div.appendTo($("body"));
        var ncolor = div.css("color");
        div.remove();
        div = null;
        var res = /^\s*rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)\s*$/.exec(ncolor);
        if (!res) {
            return false;
        }
        var comps = [parseInt(res[1]), parseInt(res[2]), parseInt(res[3])];
        var lum = comps[0] * 0.3 + comps[1] * 0.59 + comps[1] * 0.11;
        if (lum < 128) {
            return true;
        }
        return false;
    }
});

openerp.web.form.WidgetHtml = openerp.web.form.Widget.extend({
    render: function () {
        var $root = $('<div class="oe_form_html_view">');
        this.render_children(this, $root);
        return $root.html();
    },
    render_children: function (object, $into) {
        var self = this,
            fields = this.view.fields_view.fields;
        _(object.children).each(function (child) {
            if (typeof child === 'string') {
                $into.text(child);
            } else if (child.tag === 'field') {
                $into.append(
                    new (self.view.registry.get_object('frame'))(
                        self.view, {tag: 'ueule', attrs: {}, children: [child] })
                            .render());
            } else {
                var $child = $(document.createElement(child.tag))
                        .attr(child.attrs)
                        .appendTo($into);
                self.render_children(child, $child);
            }
        });
    }
});

openerp.web.form.WidgetRawHtml = openerp.web.form.Field.extend({
    set_value: function(value) {
        var self = this;
        self._super(value);
        self.$element.html(value);
    }
});

openerp.web.form.SaveReminder = openerp.web.form.Widget.extend({
    template: "SaveReminder",
    init: function(parent, dataset) {
        this.start(parent, dataset);
    },
    start: function(parent, dataset) {
        var self = this;
        this.$element = $();
        this.renderer = QWeb.render(this.template, { 'widget': this });
        this.render_element();
        this.$element.appendTo(parent.dataset.parent_view.sidebar.$element);
        this.$element.effect("shake");
        this.$element
            .delegate('.ea_notificastion_button', 'click', function(){
                dataset.parent_view && dataset.parent_view.do_save();
            })
            .find('>span').hover(function(){
                self.show_content();
            })
        ;
        parent.dataset.parent_view.on_saved.add(function(res){self.stop();})
    },
    show_content: function(){
        var self = this;
        var $content = this.$element.find('.ea_notification_content');
        self.set_hide_timer($content[0]);
        $content[0].style.display = "inherit";
        $content.mouseout(function(){
            self.set_hide_timer(this);
        });
        $content.mouseover(function(){
            if (typeof(self.reminder_visibible_timer)!='undefined') {
                clearTimeout(self.reminder_visibible_timer);
                delete self.reminder_visibible_timer;
            }
        })
    },
    set_hide_timer: function(element) {
        var self = this, $content = element;
        if (typeof(self.reminder_visibible_timer)=='undefined')
        self.reminder_visibible_timer = setTimeout(function(){
            $($content).fadeOut(500);
            delete self.reminder_visibible_timer;
        },2000);
    },
});

/**
 * Registry of form widgets, called by :js:`openerp.web.FormView`
 */
openerp.web.form.widgets = new openerp.web.Registry({
    'frame' : 'openerp.web.form.WidgetFrame',
    'group' : 'openerp.web.form.WidgetGroup',
    'notebook' : 'openerp.web.form.WidgetNotebook',
    'notebookpage' : 'openerp.web.form.WidgetNotebookPage',
    'separator' : 'openerp.web.form.WidgetSeparator',
    'label' : 'openerp.web.form.WidgetLabel',
    'button' : 'openerp.web.form.WidgetButton',
    'char' : 'openerp.web.form.FieldChar',
    'id' : 'openerp.web.form.FieldID',
    'email' : 'openerp.web.form.FieldEmail',
    'geolocation' : 'openerp.web.form.FieldGeoLocation',
    'url' : 'openerp.web.form.FieldUrl',
    'text' : 'openerp.web.form.FieldText',
    'wysiwyg' : 'openerp.web.form.FieldTextWysiwyg',
    'date' : 'openerp.web.form.FieldDate',
    'datetime' : 'openerp.web.form.FieldDatetime',
    'selection' : 'openerp.web.form.FieldSelection',
    'one2one' : 'openerp.web.form.FieldOne2One',
    'many2one' : 'openerp.web.form.FieldMany2One',
    'many2many' : 'openerp.web.form.FieldMany2Many',
    'one2many' : 'openerp.web.form.FieldOne2Many',
    'one2many_list' : 'openerp.web.form.FieldOne2Many',
    'reference' : 'openerp.web.form.FieldReference',
    'boolean' : 'openerp.web.form.FieldBoolean',
    'float' : 'openerp.web.form.FieldFloat',
    'integer': 'openerp.web.form.FieldFloat',
    'float_time': 'openerp.web.form.FieldFloat',
    'progressbar': 'openerp.web.form.FieldProgressBar',
    'image': 'openerp.web.form.FieldBinaryImage',
    'binary': 'openerp.web.form.FieldBinaryFile',
    'statusbar': 'openerp.web.form.FieldStatus',
    'html': 'openerp.web.form.WidgetHtml',
    'raw_html': 'openerp.web.form.WidgetRawHtml'
});
