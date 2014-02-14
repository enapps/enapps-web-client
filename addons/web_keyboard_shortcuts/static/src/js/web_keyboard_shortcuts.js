$.ctrl = function(key, callback, args) {
    $(document).keydown(function(e) {
        if(!args) args=[]; // IE barks when args is null 
        if((e.keyCode == key.charCodeAt(0) || e.keyCode == key) && e.ctrlKey) {
            callback.apply(this, args);
            return false;
        }
    });        
};



//Save the current object
$.ctrl('S', function() {
    $('.oe_form_button_save').each(function() {
        if($(this).parents('div:hidden').length == 0){
            $(this).trigger('click');
        }
    });
});

//Delete the current object
$.ctrl('46', function() {
    $('.oe_form_button_delete').each(function() {
        if($(this).parents('div:hidden').length == 0){
            $(this).trigger('click');
        }
    });
});

//New object
$.ctrl('N', function() {
    $('.oe_form_button_create').each(function() {
        if($(this).parents('div:hidden').length == 0){
            $(this).trigger('click');
        }
    });
});

//Duplicate the current object
$.ctrl('D', function() {
    $('.oe_form_button_duplicate').each(function() {
        if($(this).parents('div:hidden').length == 0){
            $(this).trigger('click');
        }
    });
});

//First object
$.ctrl('33', function() {
    $('.oe_button_pager[data-pager-action="first"]').each(function() {
        if($(this).parents('div:hidden').length == 0){
            $(this).trigger('click');
        }
    });
});

//Previous object
$.ctrl('38', function() {
    $('.oe_button_pager[data-pager-action="previous"]').each(function() {
        if($(this).parents('div:hidden').length == 0){
            $(this).trigger('click');
        }
    });
});

//Next object
$.ctrl('40', function() {
    $('.oe_button_pager[data-pager-action="next"]').each(function() {
        if($(this).parents('div:hidden').length == 0){
            $(this).trigger('click');
        }
    });
});

//Last object
$.ctrl('34', function() {
    $('.oe_button_pager[data-pager-action="last"]').each(function() {
        if($(this).parents('div:hidden').length == 0){
            $(this).trigger('click');
        }
    });
});

// ListView listeners
$(document).keydown(function(event) {
    if ($.mobile) return;
    with(window.openerp.sessions.session0.webclient.action_manager) {
    if(inner_viewmanager!=null && inner_viewmanager.active_view==="list"){
        var delay = (function(){
                var timer = 0;
                return function(callback, ms){
                    clearTimeout(timer);
                    timer = setTimeout(callback, ms);
                };
            })();
        var fire_keydown_action = (function(e) {
        try{
            var _id = window.openerp.sessions.session0.webclient.action_manager.inner_viewmanager.element_id,
            _viewmanager = _.find(window.openerp.sessions.session0.webclient.action_manager.widget_children,function(el) {
                return el.element_id===_id;
            });
            var list_widget = _.find(_viewmanager.widget_children, function(widget) {return widget.__template__==="ListView"});
            if (typeof(list_widget)=="undefined") return;
            var itself = list_widget.groups.children[null];
            if (!itself || !itself.$current) return;
            var $row = itself.$current.find('tr[data-id].selected:visible'),
                is_selection = (e.ctrlKey||e.shiftKey)?true:false;
            var do_select = (function(element){
                delete key_is_handled;
                delay(function(){
                    if (!is_selection) $row.removeClass('selected');
                    $(element).addClass('selected');
                    var sel_position = $(element).position().top;
                    if (!(sel_position>window.scrollY && sel_position<window.scrollY+window.innerHeight-200))
                    $('body').animate({ scrollTop: sel_position }, 100);
                    var selection = itself.get_selection();
                    $(itself).trigger('selected', [selection.ids, selection.records]);
                },100);
            });
            if ($row.length)
            switch(e.which) {
                case 38:
                    // select Previous row
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    var trgt_index = $row.first().index();
                    var current_table = itself.$current || itself.view.$element.find('tbody.ui-widget-content');
                    if (trgt_index === 0) {
                        if (!is_selection)
                            do_select(current_table.find('tr[data-id]')[itself.dataset.ids.length-1]);
                    } else {
                        do_select(current_table.find('tr[data-id]')[trgt_index-1]);
                    }
                    break;
                case 40:
                    // select Next row
                    if (e.ctrlKey === true) {
                        return false;
                    }
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    var trgt_index = $row.last().index();
                    var current_table = itself.$current || itself.view.$element.find('tbody.ui-widget-content');
                    if (trgt_index === itself.dataset.ids.length-1) {
                        if (!is_selection)
                            do_select(current_table.find('tr[data-id]')[0]);
                    } else {
                        do_select(current_table.find('tr[data-id]')[trgt_index+1]);
                    }
                    break;
                case 13:
                    // open Form view
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    _viewmanager.$element.find('.oe_vm_switch button[data-view-type="form"]').trigger('click');
                    break;
            }
        } catch(error){console.warn('Keyboard Shortcuts error',error);}
        });
        if( !(event.ctrlKey===true && event.which===17) && event.originalEvent.srcElement.tagName==="BODY"){
            fire_keydown_action(event);
        }
    }
    }
});