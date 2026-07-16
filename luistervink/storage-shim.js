/* window.storage → localStorage
   Zelfde interface als de opslag binnen Claude-artifacts, zodat de app
   ongewijzigd blijft werken. Data staat in de browser van dit apparaat.
   Backup maken? Gebruik de export/import-knop in de app zelf. */
(function () {
  var NS = "luistervink::"; // eigen naamruimte per app, voorkomt botsingen op hetzelfde domein
  function full(key) { return NS + String(key); }
  window.storage = {
    get: async function (key, shared) {
      var v = localStorage.getItem(full(key));
      if (v === null) return null;
      return { key: String(key), value: v, shared: !!shared };
    },
    set: async function (key, value, shared) {
      localStorage.setItem(full(key), String(value));
      return { key: String(key), value: String(value), shared: !!shared };
    },
    delete: async function (key, shared) {
      localStorage.removeItem(full(key));
      return { key: String(key), deleted: true, shared: !!shared };
    },
    list: async function (prefix, shared) {
      var keys = [];
      var want = NS + (prefix ? String(prefix) : "");
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(want) === 0) keys.push(k.slice(NS.length));
      }
      return { keys: keys, prefix: prefix || "", shared: !!shared };
    }
  };
})();
