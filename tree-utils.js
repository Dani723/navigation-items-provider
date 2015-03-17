import Ember from 'ember';

var isChild = function(child, parent) {
  if (parent.items instanceof Array) {
    if (parent.items.indexOf(child) !== -1) {
      return true;
    }
  }
  return false;
};

var isAncestor = function(child, ancestor) {
  if (ancestor.items instanceof Array) {
    if (isChild(child, ancestor)) {
      return true;
    } else {
      var check = false;
      ancestor.items.forEach(function(item) {
        if (isAncestor(child, item)) {
          check = true;
        }
      });
      return check;
    }
  }
  return false;
};

var selectAndOpenAncestors = function(item, selectedItems) {
  if ('_parentItem' in item) {
    if (!item._parentItem.selected) {
      Ember.set(item._parentItem, 'selected', true);
      Ember.set(item._parentItem, 'opened', true);
      selectedItems.push(item._parentItem);
      selectAndOpenAncestors(item._parentItem, selectedItems);
    }
  }
};

export {isChild, isAncestor, selectAndOpenAncestors};
