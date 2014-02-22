/**
 * handles editability case for lists, because it depends on form and forms already depends on lists it had to be split out
 * @namespace
 */
openerp.web.list_editable = function (openerp) {
    var KEY_RETURN = 13,
        KEY_ESCAPE = 27;
    var QWeb = openerp.web.qweb;
    // editability status of list rows
    openerp.web.ListView.prototype.defaults.editable = null;

    // TODO: not sure second @lends on existing item is correct, to check
    openerp.web.ListView.include(/** @lends openerp.web.ListView# */{
        init: function () {
            var self = this;
            this._super.apply(this, arguments);
            $(this.groups).bind({
                'edit': function (e, id, dataset) {
                    self.do_edit(dataset.index, id, dataset);
                },
                'saved': function () {
                    if (self.groups.get_selection().length) {
                        return;
                    }
                    self.configure_pager(self.dataset);
                    self.compute_aggregates();
                }
            });
        },
        /**
         * Handles the activation of a record in editable mode (making a record
         * editable), called *after* the record has become editable.
         *
         * The default behavior is to setup the listview's dataset to match
         * whatever dataset was provided by the editing List
         *
         * @param {Number} index index of the record in the dataset
         * @param {Object} id identifier of the record being edited
         * @param {openerp.web.DataSet} dataset dataset in which the record is available
         */
        do_edit: function (index, id, dataset) {
            _.extend(this.dataset, dataset);
        },
        /**
         * Sets editability status for the list, based on defaults, view
         * architecture and the provided flag, if any.
         *
         * @param {Boolean} [force] forces the list to editability. Sets new row edition status to "bottom".
         */
        set_editable: function (force) {
            // If ``force``, set editability to bottom
            // otherwise rely on view default
            // view' @editable is handled separately as we have not yet
            // fetched and processed the view at this point.
            this.options.editable = (
                    (force && "bottom")
                    || this.defaults.editable);
        },
        // do_delete: function(ids) {
        //     var self = this;
        //     self._super(ids);
        //     self.get
        //     if (self.get_selected_ids()[0].toString() == self.$element.find('.form-cont tr')[0].getAttribute('data-id')) {
        //         self.$element.find('.form-cont tr').hide();}
        // },
        /**
         * Replace do_search to handle editability process
         */
        do_search: function(domain, context, group_by) {
            this.set_editable(context['set_editable']);
            this._super.apply(this, arguments);
        },
        /**
         * Replace do_add_record to handle editability (and adding new record
         * as an editable row at the top or bottom of the list)
         */
        do_add_record: function (row_index) {
            if (this.options.editable) {
                if (typeof(row_index)==='number') this.groups.new_record(row_index);
                    else this.groups.new_record();
            } else {
                this._super();
            }
        },
        // do_delete: function(ids) {

        // },
        on_loaded: function (data, grouped) {
            // tree/@editable takes priority on everything else if present.
            this.options.editable = data.arch.attrs.editable || this.options.editable;
            return this._super(data, grouped);
        },
        /**
         * Ensures the editable list is saved (saves any pending edition if
         * needed, or tries to)
         *
         * Returns a deferred to the end of the saving.
         *
         * @returns {$.Deferred}
         */
        ensure_saved: function () {
            return this.groups.ensure_saved();
        }
    });

    openerp.web.ListView.Groups.include(/** @lends openerp.web.ListView.Groups# */{
        passtrough_events: openerp.web.ListView.Groups.prototype.passtrough_events + " edit saved",
        new_record: function (row_index) {
            // TODO: handle multiple children
            this.children[null].new_record(row_index);
        },
        re_adjust_edition_form: function() {
            if (!!this.children[null].edition_form && this.children[null].edition_form.$element.parent('.form-cont').length>0) {
                this.children[null].get_fields_widths();
                this.children[null].adjust_form_view();
            }
        },
        /**
         * Ensures descendant editable List instances are all saved if they have
         * pending editions.
         *
         * @returns {$.Deferred}
         */
        ensure_saved: function () {
            return $.when.apply(null,
                _.invoke(
                    _.values(this.children),
                    'ensure_saved'));
        },
    });
    openerp.web.ListView.List.include(/** @lends openerp.web.ListView.List# */{
        row_selected: function(event) {
            var self = this;
            this._super.apply(this, arguments);
            if (self.options.editable && !event.ctrlKey && !event.shiftKey) {
                self.view.window_pos = window.scrollY;
                self.session.window_pos = window.scrollY;
                self.edit_record($(event.currentTarget).data('id'), event);
            }
            else {if (self.edition) {self.edition_form.$element.unbind(); self.ensure_saved().then(function(){self.remove_edition_form()}); } }
        },
        init: function(view, node) {
            var self = this;
            self._super(view, node);
            if (self.view.__template__==="ListView" && self.view.dataset.widget_parent
                && self.view.dataset.widget_parent.view
                && self.view.dataset.widget_parent.view.on_button_save) {
                self.view.dataset.widget_parent.view.on_saved.add_first(function(){
                    self.ensure_saved(false);
                    if (self.edition_form) {
                        self.edition_form.$element.unbind();
                    }
                });
                self.view.do_delete.add_last(function(del_id,res){
                    self.session.window_pos = window.scrollY;
                    if (self.edition_id) {
                        if (self.edition_id===del_id[0]) {
                            self.show_edited_row();
                            self.remove_edition_form();
                        } else {
                            if (self.$current!==null){
                            var del_h = self.$current.find('[data-id=' + del_id[0] + ']').outerHeight(true);
                                if (self.$current.find('tr.selected').length!==0 && self.$current.find('[data-id=' + del_id[0] + ']')[0].rowIndex<self.$current.find('tr.selected')[0].rowIndex)
                                { var $this_form = self.edition_form.$element.parent('div');
                                    $this_form.css('top',$this_form.position().top-del_h);
                                }
                            }
                            // else { self.remove_edition_form(); }
                        }
                    }
                });
                self.view.dataset.on_change && self.view.dataset.on_change.add(function(){
                    if ((self.dataset.to_write.length>0 || self.dataset.to_create.length>0)
                        && !self.view.save_reminder
                        && !!self.view.dataset.parent_view.sidebar
                        ) {
                            // self.reminder_save();
                        }
                });
            }
        },
        /**
         * Adapts this list's view description to be suitable to the inner form
         * view of a row being edited.
         *
         * @returns {Object} fields_view_get's view section suitable for putting into form view of editable rows.
         */
        get_form_fields_view: function () {
            // deep copy of view
            var self =this;
            var attrArr = [];
            if (!!self.fieldsview) return self.fieldsview;
            view = $.extend(true, {}, this.group.view.fields_view);
            _($('tr[data-id]:last td:visible')).each(function(fv){
                if (fv.getAttribute('data-field') && fv.getAttribute('data-field')!=='undefined')
                {
                 attrArr.push(fv.getAttribute('data-field'))}
                })
            _(view.arch.children).each(function (widget) {
                widget.attrs.nolabel = true;
                if (widget.tag === 'button') {
                    delete widget.attrs.string;
                }
            });
            for (i in view.fields) { if (i=='name') {view.fields[i].type='text'}}
            view.arch.attrs.col = 2 * view.arch.children.length;
            self.fieldsview = view;
            return view;
        },
        on_row_keyup: function (e) {
            var self = this;
            var created_flag = false;
            switch (e.which) {
            case 33:
            // PageUp key
            case 34:
            // PageDown key
            case 35:
            // End key
            case 36:
            // Home key
            case KEY_RETURN:
                for (el in self.dataset.to_create) {
                    if (self.dataset.to_create[el].id===self.dataset.context.active_id) created_flag=true;
                }
                $(e.target).blur();
                e.preventDefault();
                e.stopImmediatePropagation();
                setTimeout(function () {
                    var saved_def;
                    if (self.edition_form.is_dirty() && self.check_if_changed())
                    {
                        saved_def = self.save_row();
                    }
                    else {
                        saved_def = new $.Deferred();
                        saved_def.resolve({'edited_record': self.records.get(self.edition_id)});
                    }
                    saved_def.done(function (result) {
                        self.edition_form.$element.unbind('focusout');
                        created_flag = created_flag || (!!self.edition_form ? self.edition_form.created_flag : true);
                        if ( (result && result.created) || created_flag && !self.edition_form ) {
                            if (typeof(self.dataset.to_create) == 'undefined')
                                self.edition_form.created_flag = true;
                            if (self.edition_insertion)
                            {
                                self.save_row_at(self.edition_insertion,result.edited_record.attributes.id).done(function(){
                                    self.has_been_saved.resolve();
                                });
                            }
                            else {
                                self.has_been_saved.resolve();
                                self.new_record();
                                return;
                            }
                        }
                        if (
                            !e.shiftKey && ([33,34,35,36]).indexOf(e.which)<0
                            &&
                            result && (!result.edited_record
                                || (result.edited_record
                                    && (!!result.edited_record.attributes.sequence
                                        && result.edited_record.attributes.sequence == _.max(self.dataset.cache.map(function(rec){return rec.values.sequence}))
                                        && (
                                            (self.dataset.index == self.dataset.ids.filter(function(id){return !_.isString(id) }).length-1 && !self.edition_insertion)
                                            || _.isString(self.edition_id) && self.dataset.index == self.dataset.ids.length-1
                                            )
                                        )
                                        || !result.edited_record.attributes.sequence && self.dataset.index == self.dataset.ids.length-1
                                    )
                                )
                            )
                        {
                            self.has_been_saved.resolve();
                            self.new_record();
                            return;
                        }
                        var next_record_id,
                            next_record;
                        if (result.edited_record) {
                            var dataset_index;
                            switch (e.which){
                                case 36:
                                    dataset_index = 0;
                                    break;
                                case 35:
                                    dataset_index = self.dataset.ids.length-1;
                                    break;
                                default:
                                    dataset_index = self.records.indexOf(result.edited_record) +1 - 2 * (e.shiftKey && e.which == KEY_RETURN || e.which == 33);
                                    break;
                            }
                            next_record = self.records.at( dataset_index < 0 ? self.dataset.ids.length-1 : dataset_index );
                        } else {
                            next_record = self.records.at(++self.edition_form.dataset.index);
                        }
                        if (next_record) {
                            next_record_id = next_record.get('id');
                            self.dataset.index = _(self.dataset.ids)
                                    .indexOf(next_record_id);
                        } else {
                            self.dataset.index = 0;
                            next_record_id = self.records.at(0).get('id');
                        }
                        self.has_been_saved.resolve();
                        self.edit_record(next_record_id, e);
                    });
                },0);
                break;
            case KEY_ESCAPE:
                this.cancel_edition().done(function(){
                    if (self.edition_form) {
                        self.edition_form.$element.unbind();
                        self.edition_form.$element.hide();
                    };
                    self.show_edited_row();
                });
                break;
            }
        },
        get_fields_widths: function() {
            var self = this, i = 0;
            self.field_width = {};
            _.each(self.$current.parent().find('thead.ui-widget-header tr.oe-listview-header-columns th[data-id]:visible'),function(col){
                var colname = col.getAttribute('data-id');
                if (colname.trim()!=="" && col.style.display!='none' && col.clientWidth>0) {
                    self.field_width[colname] = {'width': $(col).outerWidth(true), 'axis': i};
                    i++;
                }
            })
        },
        flexible_textarea: function(ele) {
            if (!ele) return;
            ele.style.height = '2em';
            var divider = 20;
            var form_height = this.edition_form.$element.outerHeight();
            var newHeight = ( ele.scrollHeight>divider ? ele.scrollHeight +5 : '22' );
            ele.style.height = newHeight.toString() + 'px';
            this.$current.find('tr[data-id="'+this.edition_id+'"]').height(Math.max(form_height,newHeight));
        },
        format_button_fields: function(element) {
            var self = this,
                before_bttn_name = $(element).closest('td.oe_form_frame_cell').prev().find('input[name]').attr('name'),
                list_header = self.$current.parent().find('thead.ui-widget-header tr.oe-listview-header-columns:last'),
                bttn_name;
            bttn_name = list_header.find('th[data-id="'+before_bttn_name+'"]').next().attr('data-id');
            if (self.field_width.hasOwnProperty(bttn_name)) return self.field_width[bttn_name];
            return 0;
        },
        adjust_form_view: function () {
            if (!!this.dataset.parent_view && this.dataset.parent_view.$element.is(':visible')==false) return;
            var self = this,
                $new_row = self.edition_form.$element,
                $this_form = $new_row.parent('div'),
                current_row = self.$current.find('tr[data-id="'+self.edition_id+'"]'),
                firstColumn = $new_row.find('>td').filter(':visible:first'),
                firstColWidth = 0;
            $new_row.find('> td')
                          .addClass('oe-field-cell')
                          .removeAttr('width')
                          .removeAttr('colspan')
                      .end()
                      .find('td:last').removeClass('oe-field-cell').end();
            for (fw in self.field_width) {
                var nrcld = $new_row.find('.oe_form_frame_cell');
                    nrcld.has('[name="'+fw+'"]').width(self.field_width[fw].width).css('display','');
            }
            $new_row.find('textarea').attr('rows','1').css({'border-radius':'0','width':'100%', 'font-size':'inherit','overflow':'hidden'});
            self.flexible_textarea($new_row.find('textarea')[0]);
            if (current_row.length > 0) {
                current_row.children('td:not(.oe-record-delete)').attr('disabled', 'disabled').css('visibility','hidden');
                var left_f = current_row.find('.oe-field-cell:visible:first').position().left,
                    top_f = current_row.position().top,
                    row_height = Math.max(35,$this_form.outerHeight())+'px';
            }
            // var form_pad_top = $.browser.mozilla ? (-1*(current_row.outerHeight()+4)) : 0;
            $new_row.parent('div').css({'top':top_f,'left':left_f});
            _.each(_.difference(self.edition_form.fields,Object.keys(self.field_width)), function(el) {
                self.edition_form.$element.find('[name="'+el+'"]').closest('td').css('display','none')
            });
            // Adjusting width of columns containing buttons which don't have a name attribute
            _.each(self.edition_form.$element.find('>td button:not(:visible)'),function(el){
            })
            var hidden_colmns = self.edition_form.$element.find('button[style*="visibility: hidden"]');
            hidden_colmns.closest('td.oe_form_button').css({'min-width':'0px','display':''});
            hidden_colmns.hide();
            return $.when();
        },
        adjust_row_height: function(e,t) {
            var self = this;
            var $addNewRow = self.$current.find('div.ea_add_newrow');
            var sec = t || 500;
            setTimeout(function() {
                if (typeof(self.$current)!=='undefined' && self.$current!==null) {
                    // $addNewRow.css('visibility','hidden');
                    var adp_height = $(e.target).closest('tr[id]').height();
                    var background_row = (typeof(self.edition_id)!=='undefined' ? self.$current.find('tr[data-id="'+self.edition_id+'"]') : self.$current.find('tr:not([data-id]):first'));
                    if (background_row.height()!==adp_height) {
                        background_row.height(adp_height);
                        $.when(self.add_link_create_line()).then(function(){$addNewRow.css('visibility','visible');});
                    }
                };
                $addNewRow.css('visibility','visible');
            },sec);
        },
        recalculate_sequnces: function(target_row_index,new_seq) {
            var list = this,
                dataset = list.dataset,
                start_index = target_row_index-1<0?0:target_row_index-1,
                result = new $.Deferred(),
                seq = new_seq+1
                dist = (!!list.buffer_rows_ids)?0:1;
            for (var i=start_index; i<(list.records.records.length-dist); i++) {
                var rec = list.records.at(i);
                // avoid selected records sequence changes
                if (!!list.buffer_rows_ids && list.buffer_rows_ids.indexOf(rec.attributes.id)>=0) continue;
                var data_rec = dataset.cache.filter(function(el){return el.id===rec.attributes.id;})[0];
                data_rec.values.sequence = seq;
                var _to_write = dataset.to_write.filter(function(el){return el.id===rec.attributes.id;});
                if (_to_write.length==0) dataset.to_write.push({id: rec.attributes.id, values: {sequence: seq}});
                    else _to_write[0].values.sequence = seq;
                rec.set('sequence', seq);
                seq++;
            }
            dataset.on_change();

            return result.resolve();
        },
        save_row_at: function(target_row_index, saved_id) {
            var self = this,
                new_seq,
                ind_to_replace = (target_row_index-1)<0?0:target_row_index;
            if (this.records.at(target_row_index).attributes.sequence<=1) {
                new_seq = 0;
            } else {
                new_seq = self.records.get(self.$current.find('tr[data-id]:nth(' + ind_to_replace + ')').data('id')).attributes.sequence;
            }
            var rec = self.records.get(saved_id);
            if (typeof(rec)!=='undefined') {
                rec.set('sequence',new_seq);
            } else {
                self.records.add(
                    {id: saved_id, sequence: new_seq},
                    {at: self.options.editable === 'top' ? 0 : null}
                    );
            }
            self.dataset.write(saved_id, {sequence: new_seq});
            delete self.edition_insertion;
            return self.recalculate_sequnces(target_row_index+1,new_seq).done(function(){
                var to_move = _.find(self.records.records, function(el) {return el.attributes.id === saved_id});
                self.records.remove(to_move);
                self.records.add(to_move, { at: target_row_index });
                self.refresh_zebra();
            })
        },
        get_default_fields_values: function() {
            if (!this.edition || !this.edition_form) return {};
            var form = this.edition_form.$element;
            var fields_vals = {};
            _.each($(form).find('[name]:visible'),function(el){
                if (el.parentNode.style.display!=='none' && el.getAttribute('readonly')==null) {
                    if (el.type=='checkbox') {fields_vals[el.name] = el.checked;}
                    else {fields_vals[el.name] = el.value;}
                };
            });
            this.edition_form.default_fields_vals = fields_vals;
            return fields_vals;
        },
        check_if_changed: function() {
            if (!this.edition || !this.edition_form) return false;
            var form = $(this.edition_form.$element),
                result = false,
                fields_vals = this.edition_form.default_fields_vals;
            for (el in fields_vals) {
                var $input = form.find('[name="'+el+'"]'),
                    $input_val = $input.is(':checkbox')?$input.is(':checked'):$input.val();
                if ( $input_val!=fields_vals[el] ) {
                    result = true;
                    break;
                }
            }
            return result
        },
        check_required_fields: function() {
            var self = this,
                res = _.any(_.filter(self.edition_form.fields, function(fd){if (fd.required===true) { return fd }}), function(el) {
                if ($(self.edition_form.$element).find('[name="'+el.name+'"]').val()==='' || 0) {return el}
            });
            return res;
        },
        get_window_position: function() {
            this.session.window_pos = window.scrollY;
        },
        add_form_listeners: function (target_row_index) {
            var self = this;
            var $form = self.edition_form.$element;
            var new_line = false;
            self.edition_insertion = target_row_index;
            self.has_been_saved = new $.Deferred();
            var refresh = (function(e) {
                if (!self.edition_form) return;
                self.has_been_saved = new $.Deferred();
                if (e!=null) {
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    if (!!e.relatedTarget && e.relatedTarget.isEqualNode($('button.oe-edit-row-save')[0])) {
                        return self.ensure_saved(true).done(function(){
                            self.dataset.parent_view && self.dataset.parent_view.do_save();
                        })
                     }
                }
                var is_insertion = ((target_row_index!=null) && _.isNumber(target_row_index))?true:false;
                if ( !!self.edition_form && self.edition_form.is_dirty() && self.check_if_changed() && !self.check_required_fields() ) {
                    if (self.dataset.index!==null) {
                        var $source_row = self.$current.find('tr[data-id="'+self.edition_id+'"]');
                        if (new_line==false) {
                            self.ensure_saved(false).done(function(){
                                self.$current.find('tr[data-id="'+self.edition_id+'"]').children('td').css('visibility','hidden');
                                if (!!self.edition_form) {
                                    self.get_default_fields_values();
                                    self.get_fields_widths();
                                    self.adjust_form_view();
                                    // self.adjust_row_height(e,1);
                                }
                                self.has_been_saved.resolve();
                            });
                        } else {
                            self.edition_form.do_save(null, self.options.editable === 'top').done(function(){
                                self.get_default_fields_values();
                                self.has_been_saved.resolve();
                            });
                            $source_row.children('td').css('visibility','hidden');
                        }
                    }
                    else if (typeof(e.srcElement)=='undefined' || e.srcElement.tagName!="SELECT") {
                        if (!is_insertion && !!self.edition_form.fields.sequence && !!self.edition_form.fields.parent_id && self.edition_form.fields.parent_id.value==null)
                            self.set_row_seq_bottom();
                        self.edition_form.do_save(null, self.options.editable === 'top').done(function (result) {
                            if (result.created && !self.edition_id) {
                                if (target_row_index!=null && _.isNumber(target_row_index)) {
                                    self.save_row_at(target_row_index, result.result);
                                    self.edition_insertion = target_row_index;
                                } else {
                                    self.records.add({id: result.result}, {at: self.options.editable === 'top' ? 0 : null});
                                }
                                self.get_default_fields_values();
                                self.edition_id = result.result;
                                new_line = true;
                                self.$current.find('tr[data-id="'+result.result+'"]').hide();
                                self.has_been_saved.resolve();
                            }
                        })
                    }
                } else {
                    if (!self.edition_form.is_dirty() || !self.check_if_changed()) self.has_been_saved.resolve();
                }
            });
            var delay = (function(){
                var timer = 0;
                return function(callback, ms){
                    clearTimeout(timer);
                    timer = setTimeout(callback, ms);
                };
            })();
            self.get_window_position();
            if (typeof(self.dataset.widget_parent.widget_parent.widget_parent.sidebar)!=='undefined'){
                var sidebar_toggle = self.dataset.widget_parent.widget_parent.widget_parent.sidebar.do_toggle;
                if (sidebar_toggle.callback_chain.length>1) { sidebar_toggle.callback_chain.pop(); }
                sidebar_toggle.add_last(function(){
                    if (self.edition_form && self.$current)
                    {self.get_fields_widths();self.adjust_form_view();}
                });
            };
                self.edition_form.$element
                    // .delegate('button.oe-edit-row-save', 'click', function () {
                    //     self.save_row(); })
                    // .delegate('input','focusout', function(e) {e.stopPropagation(); refresh(e)})
                    .delegate('button', 'keyup', function (e) {
                        e.stopImmediatePropagation();
                    })
                    .delegate('input[type="checkbox"]','click', function(e){
                        e.stopPropagation();
                        refresh(e);
                    })
                    .delegate('td:not(.oe_form_field_boolean)','click', function(e) {
                        e.stopImmediatePropagation();
                        self.adjust_row_height(e);
                    })
                    .keyup(function (e) {
                        e.stopPropagation();
                        e.stopImmediatePropagation();
                        return self.on_row_keyup.apply(self, arguments);
                    })
                    .keydown(function (e) {
                        e.stopPropagation();
                        if (e.which == 33 || e.which == 34) e.preventDefault();
                        if (e.shiftKey && e.which==KEY_RETURN) {
                            e.preventDefault();
                            e.stopImmediatePropagation();
                        }
                    })
                    .keypress(function (e) {
                        if (e.which === KEY_RETURN) {
                            // self.edition_form.$element.unbind('focusout');
                            return false;
                        }
                    });
                self.edition_form.on_created.add_last(function(){
                    self.get_default_fields_values();
                    self.edition_form.created_flag = true;
                });
                self.edition_form.$element.bind('focusout',function(e) {
                    if (
                        e.relatedTarget
                        && ( e.relatedTarget.classList.contains('oe_form_button_save') || e.relatedTarget.classList.contains('oe-edit-row-save') )
                        && self.edition_form && self.check_if_changed() && self.edition_form.is_dirty() && self.edition_form.is_valid()
                        )
                    {
                        self.dataset.parent_view.is_initialized = new $.Deferred();
                        self.save_row().then(function(){
                            self.dataset.parent_view.is_initialized.resolve();
                        });
                    } else {
                        $.async_when().then(function(){ refresh(e); });
                    }
                });
                self.edition_form.$element.find('textarea').keyup(function(ele){self.flexible_textarea(this);})
                    // .bind('focusin',function(ele){self.flexible_textarea(this)})
                    .end();
                self.edition_form.do_save.add_last(function(){
                    self.get_default_fields_values();
                });
                // self.edition_form.do_onchange.add(function(){
                    // if (self.edition_form.is_dirty()) self.edition_form.do_save();
                // });
            return true;
        },
        make_empty_form: function (row, target_row_index) {
            var self = this;
            return $.async_when().then(function() {
                self.$current.find('tr.selected').removeClass('selected');
                var record_id = $(row).data('id'),
                    $new_row = $('<tr>', {
                        id: _.uniqueId('oe-editable-row-'),
                        'data-id': record_id,
                        'class': (row ? $(row).attr('class') : '') + ' oe_forms',
                        click: function (e) {e.stopPropagation();}
                    });
                if (self.options.editable) {
                    var $last_child = self.$current.children('tr:last');
                    if (self.records.length) {
                        if (typeof(target_row_index)!=='undefined' && _.isNumber(target_row_index)) {
                            $new_row.insertBefore(self.$current.children('[data-id]:nth-child('+(target_row_index+1)+')'));
                        } else {
                            if (self.options.editable === 'top') {
                                $new_row.insertBefore(
                                    self.$current.children('[data-id]:first'));
                            } else {
                                $new_row.insertAfter(
                                    self.$current.children('[data-id]:last'));
                                var table_bottom_position = self.$current.outerHeight()+self.$current.position().top;
                                if (!(window.scrollY <= table_bottom_position && table_bottom_position <= window.scrollY+document.body.clientHeight))
                                    $('body').animate({ scrollTop: table_bottom_position }, 1000);
                            }
                        }
                    } else {
                        $new_row.prependTo(self.$current);
                    }
                    if ($last_child.is(':not([data-id])')) {
                        $last_child.remove();
                    }
                }
                self.edition = true;
                self.edition_id = record_id;
                self.dataset.index = _(self.dataset.ids).indexOf(record_id);
                if (self.dataset.index === -1) {
                    self.dataset.index = null;
                }
                self.edition_form = _.extend(new openerp.web.ListEditableFormView(self.view, self.dataset, false), {
                    form_template: 'ListView.row.form',
                    registry: openerp.web.list.form.widgets,
                    $element: $new_row
                });

                self.edition_form.appendTo();
                self.edition_form.$element.hide();
                return $.when(self.edition_form.on_loaded(self.get_form_fields_view())).done(function () {
                    $new_row.find('> td')
                          .addClass('oe-field-cell')
                          .removeAttr('width')
                          .removeAttr('colspan')
                      .end()
                      .find('td textarea').attr('rows','1')
                      .find('td:last').removeClass('oe-field-cell').end();
                    if (self.options.isClarkGable) {
                        $new_row.prepend('<th>');
                    }
                    _(self.columns).each(function (column) {
                        if (column.meta) {
                            $new_row.prepend('<td>');
                        }
                    });
                    if (!self.options.deletable) {
                        self.view.pad_columns(
                            1, {except: $new_row});
                    }
                    return $.when(self.edition_form.do_show()).done(function() {
                        self.edition_form.$element.show();
                        $new_row.find('td.oe_form_button').css('display', '');
                        self.add_save_form_button($new_row);
                        self.edition_form.$element.find('[name]:visible:not([type="checkbox"]):first').focus().select();
                        self.add_form_listeners(target_row_index);
                        self.add_link_create_line();
                        self.edition_form.default_fields_vals = self.get_default_fields_values();
                        self.edition_insertion = target_row_index;
                        if (!!self.edition_form.datarecord.sequence
                            && !!self.edition_form.dataset.cache
                            && !!self.edition_form.dataset.cache[0])
                        {
                            if (self.edition_insertion==null)
                            {
                                with (self.edition_form.fields) {
                                    sequence.$element.find('input').val(
                                        sequence.value = self.edition_form.datarecord.sequence = _.max(self.edition_form.dataset.cache, function(rec){return rec.values.sequence}).values.sequence+1
                                    );
                                }
                            }
                            else {
                                self.edition_form.fields.sequence.value = self.edition_form.datarecord.sequence = self.edition_form.dataset.cache[target_row_index].values.sequence;
                            }
                        }
                        self.adjust_form_view();
                    });
                });
            })
        },
        add_save_form_button: function(row_element) {
            var self = this;
            var $row = $(row_element);
            var $column;
            var $save_form_button = $('<button>',{
                'class': 'oe-edit-row-save',
                'type': 'button',
                click: function(e){
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    try {
                        self.dataset.parent_view.do_save();
                    } catch(err) {
                        self.edition_form.do_save();
                        self.$current.parents('.view-manager-main-content:last').find('button.oe_form_button_save').click();
                    }
                }
            });
            if (self.edition_id) {
                $row.append();
                $column = $('<td>', {'class': 'save_form_button_column'});
                $row.append($column);
                self.edition_form.do_notify_change.add_last(function(){ $column.find('button.oe-edit-row-save').show(); });
                self.edition_form.do_save.add(function(){ $column.find('button.oe-edit-row-save').hide(); })
            } else {
                $column = $row.find('th:not([class]):first');
            }
            $column.append($save_form_button);
        },
        start_edition: function (row, target_field) {
            var self = this;
            var record_id = $(row).data('id');
            var $new_row = self.edition_form.$element;
            self.show_edited_row();
            return $.when().done(function () {
                $(row).children('td:not(.oe-record-delete)').css('visibility','hidden').attr('disabled', 'disabled').removeClass('selected');
                self.edition = true;
                self.edition_id = record_id;
                self.dataset.index = _(self.dataset.ids).indexOf(record_id);
                self.edition_form.$element.show();
                self.edition_form = _.extend(new openerp.web.ListEditableFormView(self.view, self.dataset, false), {
                    form_template: 'ListView.row.form',
                    registry: openerp.web.list.form.widgets,
                    $element: $new_row
                });
                self.edition_form.appendTo();
                $.when(self.edition_form.on_loaded(self.get_form_fields_view())).then(function () {
                    delete self.edition_form.default_focus_field;
                    self.edition_form.$element.find('> td')
                          .addClass('oe-field-cell')
                          .removeAttr('width')
                          .removeAttr('colspan')
                      .end()
                    if (self.options.isClarkGable) {
                        $new_row.prepend('<th>');
                    }
                    _(self.columns).each(function (column) {
                        if (column.meta) {
                            $new_row.prepend('<td>');
                        }
                    });
                    if (!self.options.deletable) {
                        self.view.pad_columns(
                            1, {except: $new_row});
                    }
                });

                $.async_when(self.edition_form.do_show()).done(function() {
                    self.add_form_listeners();
                    // self.edition_form.default_fields_vals = self.get_default_fields_values();
                    self.edition_form.$element.find('[name="' + target_field + '"]').focus().select();
                    self.get_fields_widths();
                    self.adjust_form_view();
                    if (!!self.view.window_pos) { window.scrollTo(0,self.view.window_pos);}
                });
                self.edition = true;
                self.edition_id = record_id;
                if (self.dataset.index === -1) {
                    self.dataset.index = null;
                }
                self.edition_form.default_fields_vals = self.get_default_fields_values();
            });
        },

        render_form: function (row, target_field) {
            var self = this;
            if (typeof(row)=='undefined') row=null;
            return $.when().done(function () {
                var record_id = $(row).data('id');
                var $new_row = $('<tr>', {
                        id: _.uniqueId('oe-editable-row-'),
                        'data-id': record_id,
                        'class': (row ? $(row).attr('class') : '') + ' oe_forms',
                        click: function (e) {e.stopPropagation();}
                    })
                    .removeClass('selected');
                self.edition = true;
                self.edition_id = record_id;
                self.dataset.index = _(self.dataset.ids).indexOf(record_id);
                if (self.dataset.index === -1) {
                    self.dataset.index = null;
                }
                self.edition_form = _.extend(new openerp.web.ListEditableFormView(self.view, self.dataset, false), {
                    form_template: 'ListView.row.form',
                    registry: openerp.web.list.form.widgets,
                    $element: $new_row
                });
                self.edition_form.appendTo();
                $.when(self.edition_form.on_loaded(self.get_form_fields_view())).then(function () {
                    if (self.options.isClarkGable) {
                        $new_row.prepend('<th>');
                    }
                    _(self.columns).each(function (column) {
                        if (column.meta) {
                            $new_row.prepend('<td>');
                        }
                    });
                    if (!self.options.deletable) {
                        self.view.pad_columns(
                            1, {except: $new_row});
                    }
                    $new_row.find('td.oe_form_button').css('display', '');
                });
                self.start_edition(row, target_field);
                $new_row.prependTo(self.$current.parents()[1]);
                var $this_form = $($new_row.wrap('<div>').parents()[0]);
                // if ($.browser.mozilla) self.$current.parents()[1].style.cssText="position: relative";
                $this_form.css('position','absolute');
                $this_form.addClass('form-cont');
                return $.when();
                });
            },
        handle_onwrite: function (source_record_id) {
            var self = this;
            var on_write_callback = self.view.fields_view.arch.attrs.on_write;
            if (!on_write_callback) { return; }
            this.dataset.call(on_write_callback, [source_record_id], function (ids) {
                _(ids).each(function (id) {
                    var record = self.records.get(id);
                    if (!record) {
                        // insert after the source record
                        var index = self.records.indexOf(
                            self.records.get(source_record_id)) + 1;
                        record = new openerp.web.list.Record({id: id});
                        self.records.add(record, {at: index});
                        self.dataset.ids.splice(index, 0, id);
                    }
                    self.reload_record(record);
                });
            });
        },
        reminder_save: function() {
            var self = this;
            this.view.save_reminder = new openerp.web.form.SaveReminder(self.view,self.dataset);
        },
        /**
         * Saves the current row, and returns a Deferred resolving to an object
         * with the following properties:
         *
         * ``created``
         *   Boolean flag indicating whether the record saved was being created
         *   (``true`` or edited (``false``)
         * ``edited_record``
         *   The result of saving the record (either the newly created record,
         *   or the post-edition record), after insertion in the Collection if
         *   needs be.
         *
         * @returns {$.Deferred<{created: Boolean, edited_record: Record}>}
         */
        save_row: function () {
            //noinspection JSPotentiallyInvalidConstructorUsage
            var self = this;
            var saveDef = new $.Deferred;
            if (_.isString(self.edition_id) && typeof(self.edition_insertion)==='undefined') self.set_row_seq_bottom();
            this.edition_form
                .do_save(null, this.options.editable === 'top')
                .done(function (result) {
                    if (result.created && !self.edition_id) {
                        self.records.add({id: result.result},
                            {at: self.options.editable === 'top' ? 0 : null});
                        self.edition_id = result.result;
                    }
                    var edited_record = self.records.get(self.edition_id);
                    return $.when(
                        self.handle_onwrite(self.edition_id)
                        ,self.cancel_pending_edition().then(function () {
                            $(self).trigger('saved', [self.dataset]);
                        })
                    ).then(function () {
                        // self.has_been_saved.resolve();
                            saveDef.resolve({
                                created: result.created || false,
                                edited_record: edited_record
                            });

                        });
                });
            return saveDef.promise();
        },
        /**
         * If the current list is being edited, ensures it's saved
         */
        set_row_seq_bottom: function() {
            var result = new $.Deferred();
            if (this.edition_form && !!this.dataset.cache && this.dataset.cache.length && !!this.edition_form.fields.sequence
                // && ((!!this.edition_form.fields.base_product && this.edition_form.fields.base_product.value===false) || !this.edition_form.fields.base_product)
                ) {
                var self = this;
                self.edition_form.datarecord.sequence = self.edition_form.fields.sequence.value = Math.max.apply(Math,_.map(self.dataset.cache, function(el){ return el.values.sequence }))+1;
                return result.resolve();
            }
            return result.promise();
        },
        ensure_saved: function (force) {
            if (this.edition) {
                var self = this;
                var ensDef, d = new $.Deferred();
                if (!!this.edition_form && this.check_if_changed() && this.edition_form.$element.is('.oe_form_dirty')) {
                    if (self.edition_insertion!=null) {
                        ensDef = self.save_row().done(function(res){
                            // var saved_id = res.created && res.result || res.edited_record.attributes.id;
                            var saved_id = res.edited_record.attributes.id;
                            return self.save_row_at(self.edition_insertion,saved_id)
                        });
                    } else {
                        ensDef = self.save_row();
                    }
                } else {
                    self.has_been_saved.resolve();
                    ensDef = $.when();
                }
                if (force == false)
                    ensDef.then(function(){
                        d.resolve();
                    });
                else
                    ensDef.then(function(){
                        self.cancel_pending_edition().then(function(){
                            return d.resolve();
                        });
                    });
                return d.promise();
            }
        },
        cancel_pending_edition: function (prev_sel_row) {
            var self = this, reload_record_def = new $.Deferred();
            if (!this.edition) {
                return $.when();
            }
            if (prev_sel_row!==undefined) {
                reload_record_def = this.reload_record(this.records.get(prev_sel_row));
                }
            if (this.edition_id && this.edition_form) {
                try {
                    reload_record_def = this.reload_record(this.records.get(this.edition_id));
                } catch(err) {
                    console.warn("Reload record ERROR",err); return $.when();
                }
            } else {
                reload_record_def = $.when();
            }
            reload_record_def.done(function () {
                if (!!self.edition_form && $(self.edition_form.$element.parents()[0]).is('div')==false) {
                    return self.remove_edition_form();
                } else {
                    var def_removed = new $.Deferred();
                    return def_removed.resolve();
                }
            });
            self.pad_table_to(5);
            return reload_record_def.promise();
        },
        remove_edition_form: function() {
            var self = this;
            var d = new $.Deferred();
            if (self.edition) {
                self.edition_form.$element.removeClass('selected');
                self.edition_form.$element.removeClass('oe_forms');
                self.edition_form.$element.unbind();
                self.view.unpad_columns();
                self.edition_form.stop();
                self.edition_form.$element.remove();
                delete self.edition_form;
                self.dataset.index = null;
                self.show_edited_row(self.edition_id);
                delete self.edition_id;
                delete self.edition;
                d = d.resolve();
            }
            return d.promise();
        },
        show_edited_row: function(edit_id) {
            var row_id = edit_id || this.edition_id || null;
            // FIXME: Dump verification
            if (row_id && this.$current!=null) {
                var $prev_row = this.$current.find('tr[data-id="'+row_id+'"]');
                $prev_row.show();
                $prev_row.children().css('visibility','visible');
                $prev_row.children('td').removeAttr('disabled');
                $prev_row.removeAttr('height').removeAttr('width');
                $prev_row.css('height','auto');
            }
        },
        /**
         * Cancels the edition of the row for the current dataset index
         */
        cancel_edition: function () {
            return this.cancel_pending_edition();
        },
        /**
         * Edits record currently selected via dataset
         */
        cleanup_form_container: function() {
            var itself = this;
            if (typeof(itself.edition_form)=='undefined' && itself.$current.parents()[1].getElementsByClassName('form-cont').length>0) {
                var i=0,
                    formsparent = itself.$current.parents()[1],
                    len = itself.$current.parents()[1].getElementsByClassName('form-cont').length;
                while (i<len) {
                    formsparent.removeChild(formsparent.getElementsByClassName('form-cont')[i]);
                    i++;
                }
            }
        },
        edit_record: function (record_id, event) {
            var self = this;
            if (event) {
                target_field = (event.target.attributes['data-field'] || event.target.parentNode.attributes['data-field'] || event.target.attributes['name']).value;
            }
            var rend = new $.Deferred();
            // self.cleanup_form_container();
            self.get_fields_widths();
            if (this.edition) {
                if ($(self.edition_form.$element.parents()[0]).is('div')) {
                    _.each(self.edition_form.fields,function(f) {
                        if (f.is_dirty() && f.wait_for_onchange) {
                            f.on_ui_change();
                        }
                    });
                    self.edition_form.do_save().done(function(){
                        self.show_edited_row();
                        self.reload_record(self.records.get(self.edition_id));
                        self.start_edition(self.$current.find('[data-id=' + record_id + ']'), target_field);
                        rend.resolve();
                    });
                } else {
                    self.ensure_saved(true).done(function() {
                        self.render_form(self.$current.find('[data-id=' + record_id + ']'), target_field);
                        rend.resolve();
                    });
                }
            }
            else if (!self.edition_form) {
                var self = this;
                rend = self.render_form(self.$current.find('[data-id=' + record_id + ']'), target_field);
            }
            $.when(self.has_been_saved,rend).done(function() {
                self.$current.find('tr.selected').removeClass('selected');
                self.$current.find('tr[data-id="'+record_id+'"]').addClass('selected');
                self.adjust_form_view();
                self.edition_form.default_fields_vals = self.get_default_fields_values();
                self.view.do_select([record_id],[self.records.get(record_id).attributes]);
                if (!self.view.dataset.parent_view || self.view.dataset.parent_view.fields_view.type != 'form') {
                    self.add_save_form_button(self.edition_form.$element[0]);
                }
                $(self).trigger(
                    'edit',
                    [record_id, self.dataset]);
                return;
            });
        },
        new_record: function (row_index) {
            var self = this;
            var ens = new $.Deferred(),
                row_index = row_index;
            if (!self.field_width) self.get_fields_widths();
            if (self.edition) {
                var edit_id = self.edition_id;
                self.edition_form.$element.unbind();
                self.has_been_saved.done(function() {
                    self.ensure_saved(true).done(function() {
                        if (self.edition_form && $(self.edition_form.$element.parents()[0]).is('div')) {
                            $.when(self.cancel_pending_edition(),self.remove_edition_form()).then(function(){
                                // self.remove_edition_form().then(function() {
                                    self.refresh_zebra();
                                    ens.resolve();
                                // });
                            })
                        } else {
                            ens.resolve();
                        }
                    })
                }
                );
            } else {
                ens.resolve();
            }
            ens.done(function(){
                self.has_been_saved = new $.Deferred();
                self.make_empty_form(null,row_index);
            });
            return ens;
        },
        render_record: function (record) {
            var index = this.records.indexOf(record),
                 self = this;
            // FIXME: context dict should probably be extracted cleanly
            return QWeb.render('ListView.row', {
                columns: this.columns,
                options: this.options,
                record: record,
                row_parity: (index % 2 === 0) ? 'even' : 'odd',
                view: this.view,
                render_cell: function () {
                    return self.render_cell.apply(self, arguments);},
                edited: !!this.edition_form
            });
        }
    });
    if (!openerp.web.list) {
        openerp.web.list = {};
    }
    if (!openerp.web.list.form) {
        openerp.web.list.form = {};
    }
    openerp.web.list.form.WidgetFrame = openerp.web.form.WidgetFrame.extend({
        template: 'ListView.row.frame'
    });
    var form_widgets = openerp.web.form.widgets;
    openerp.web.list.form.widgets = form_widgets.extend({
        'frame': 'openerp.web.list.form.WidgetFrame'
    });
    // All form widgets inherit a problematic behavior from
    // openerp.web.form.WidgetFrame: the cell itself is removed when invisible
    // whether it's @invisible or @attrs[invisible]. In list view, only the
    // former should completely remove the cell. We need to override update_dom
    // on all widgets since we can't just hit on widget itself (I think)
    var list_form_widgets = openerp.web.list.form.widgets;
    _(form_widgets.map).each(function (widget_path, key) {
        if (key === 'frame') { return; }
        var new_path = 'openerp.web.list.form.' + key;

        openerp.web.list.form[key] = (form_widgets.get_object(key)).extend({
            update_dom: function () {
                this.$element.children().css('visibility', '');
                if (this.modifiers.tree_invisible) {
                    var old_invisible = this.invisible;
                    this.invisible = true;
                    this._super.apply(this, arguments);
                    this.invisible = old_invisible;
                } else if (this.invisible) {
                    this.$element.children().css('visibility', 'hidden');
                } else {
                    this._super.apply(this, arguments);
                }
            }
        });
        list_form_widgets.add(key, new_path);
    });

    openerp.web.ListEditableFormView = openerp.web.FormView.extend({
        init_view: function() {},
        _render_and_insert: function () {
            return this.start();
        },
        reasign_set_value_functions: function() {
            var self = this;
            _.each(_.values(self.widgets), function(widget) {
                if (widget.set_value_list) {
                    widget.set_value = widget.set_value_list;
                }
            });
        },
        do_show: function() {
            var self = this;
            var result;
            if (self.dataset.index === null) {
                result = self.on_button_new();
            } else {
                if (typeof(self.dataset.ids[self.dataset.index])!=='string') {
                    self.reasign_set_value_functions();
                    var rec_pseudo = self.widget_parent.records.get(self.dataset.ids[self.dataset.index]).attributes || self.dataset.cache.filter(function(rec){return rec.id===self.dataset.ids[self.dataset.index]})[0].values;
                    result = self.on_record_loaded(rec_pseudo);
                } else {
                    return self._super();
                }
            }
            return result;
         },
    });
};
