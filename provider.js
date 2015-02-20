import Ember from 'ember';
import { TransitionMonitoringSupport } from 'ember-vcl-transition-monitoring-support';
import log from 'log';

export default Ember.Object.extend(Ember.Evented, TransitionMonitoringSupport, {
  container: null,
  resource: null,
  navigations: null,
  pages: null,
  selectedItems: [],
  initialLoad: true,
  useSlug: false,
  localize: function(l) {
    return l;
  },
  itemMap: function() {
    var self = this;
    var itemMap = Ember.Map.create();
    var navigations = this.get('navigations');
    var pagesMap = this.get('pagesMap');
    var insert = function(item) {
      var path = self.createPath(item);
      itemMap.set(path, item);
      if (item.items instanceof Array) {
        item.items.forEach(function(item) {
          insert(item);
        });
      }
    };
    navigations.forEach(function(navigation) {
      if (navigation.items) {
        navigation.items.forEach(function(item) {
          insert(item);
          if (item.page) {
            var page = pagesMap.get(item.page);
            if (page.type === 'index' && page.subPages instanceof Array) {
              page.subPages.forEach(function(subId) {
                var subPage = pagesMap.get(subId);
                var path = '/' + page.name + '/' + subPage.name;
                itemMap.set(path, item);
              });
            }
          }
        });
      }
    });
    return itemMap;
  }.property('navigations', 'pagesMap'),

  pagesMap: function() {
    var pages = this.get('pages');
    var pagesMap = Ember.Map.create();
    pages.forEach(function(page) {
      pagesMap.set(page['@id'], page);
    });
    return pagesMap;
  }.property('pages'),

  navigationMap: function() {
    var self = this;
    var navigationMap = Ember.Map.create();
    var pagesMap = Ember.Map.create();
    this.get('pages').forEach(function(page) {
      pagesMap.set(page['@id'], page.name);
    });
    var setPageName = function(item) {
      item.pageName = pagesMap.get(item.page);
      self.createPath(item);
      if (item.items instanceof Array) {
        item.items.forEach(function(item) {
          setPageName(item);
          self.createPath(item);
        });
      }
    };
    var navigations = this.get('navigations');
    navigations.forEach(function(navigation) {
      navigation.items.forEach(function(item) {
        setPageName(item);
      });
      navigationMap.set(navigation['@id'], navigation);
    });
    return navigationMap;
  }.property('navigations'),

  unknownProperty: function(property) {
    return this.get('navigationMap').get(property);
  },

  handleSelection: function(item) {
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

    var wasOpened = Ember.get(item, 'opened');
    if (this.get('currentItem') !== item) {
      var selected = this.get('selectedItems');
      var toRemove = [];
      selected.forEach(function(selectedItem) {
        if (!isAncestor(item, selectedItem)) {
          Ember.set(selectedItem, 'selected', false);
          Ember.set(selectedItem, 'opened', false);
          toRemove.push(selectedItem);
        }
      });
      toRemove.forEach(function(remove) {
        var index = selected.indexOf(remove);
        selected.splice(index, 1);
      });
      Ember.set(item, 'selected', true);
      if (item.items instanceof Array) {
        if (wasOpened) {
          Ember.set(item, 'opened', false);
        } else {
          Ember.set(item, 'opened', true);
        }
      }
      this.set('currentItem', item);
      selected.push(item);
      selectAndOpenAncestors(item, selected);
      this.set('selectedItems', selected);
    } else {
      if (wasOpened) {
        Ember.set(item, 'opened', false);
      } else {
        Ember.set(item, 'opened', true);
      }
    }
  },

  pathChanged: function(path) {
    var navs = this.get('navigations');
    var invend = {
      authN: this.get('authN')
    };
    var processActive = function(item) {
      var makeScope = function(invend) {
        return function(item) {
          Ember.set(item, 'active', eval(item.evalActive));
        };
      };
      if (typeof item.evalActive === 'string') {
        makeScope(invend)(item);
      }
      return item;
    };

    navs.forEach(function(item) {
      item.items.forEach(function(i) {
        processActive(i);
      });
    });
    this.notifyPropertyChange('navigations');
    log.debug('Path changed to \'' + path + '\'');
    var itemMap = this.get('itemMap');
    var item = itemMap.get(path);
    if (item) {
      if (!this.get('currentItem') || this.get('currentItem')['@id'] !== item['@id']) {
        log.debug('Selection handled for path ' + path);
        this.handleSelection(item);
      }
    } else {
      var initialPath = path;
      var pathElems = path.split('/');
      pathElems.shift();
      var handled = false;
      while (pathElems.length > 0) {
        path = '';
        pathElems.pop();
        pathElems.forEach(function(elem) {
          path += '/' + elem;
        });
        item = itemMap.get(path);
        if (item) {
          var left = initialPath.replace(path + '/', ''); // Firefox Hack. Trying to hash the rest of the URL
          var newPath = path + '/' + encodeURIComponent(left);
          var newItem = itemMap.get(newPath);
          if (newItem) {
            log.debug('Selection handled for path ' + newPath);
            this.handleSelection(newItem);
            handled = true;
          } else {
            log.debug('Selection handled for path ' + path);
            this.handleSelection(item);
            handled = true;
          }
          break;
        }
      }
      if (!handled) {
        this.handleSelection({});
      }
    }
  }.on('currentPathDidChange'),

  createPath: function(item) {
    var self = this;
    var path = '#';
    if (item.page) {
      var page = this.get('pagesMap').get(item.page);
      path = page.path;
      if (path.indexOf(':') !== -1) {
        var pathItems = page.path.split('/');
        pathItems.shift();
        path = '';
        var params = {};
        pathItems.forEach(function(pathItem) {
          var colonIndex = pathItem.indexOf(':');
          if (colonIndex === -1) {
            path += '/' + pathItem;
          } else {
            var slug = item.slug;
            path += '/' + encodeURIComponent((self.useSlug && slug) ? self.localize(slug, self.get('l10n').get('locale')) : item['@id']);
          }
        });
      }
      Ember.set(item, 'path', '/#!' + path);
      Ember.set(item, 'url', '/#!' + path);
    } else {
      path = item.href;
      Ember.set(item, 'path', path);
      Ember.set(item, 'url', path);
    }
    return path;
  },

  pathExists: function(path, item) {
    var page = this.get('pagesMap').get(item.page);
    if (page.path.split('/').length === path.split('/').length) {
      return true;
    }
    return false;
  },

  handleNavItem: function(item) {
    this.handleSelection(item);
    log.debug('Handling nav item', item);
    var path = this.createPath(item);
    this.get('container').lookup('route:application').transitionTo(path);
  }

});
