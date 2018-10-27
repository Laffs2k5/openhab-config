"use strict";
function queryParams(a) {
  if (!a)
    return {};
  var b,
    c = a.toString(),
    d = c.indexOf("?"),
    e = d !== -1
      ? c.substring(d + 1)
      : "",
    f = /([^&=]+)=?([^&]*)/g,
    g = function (a) {
      return decodeURIComponent(a.replace(/\+/g, " "))
    },
    h = {};
  do
    b = f.exec(e),
    b && (h[g(b[1])] = g(b[2]));
  while (b);
  return h
}
function resolveParam(a, b) {
  return void 0 !== a && void 0 !== a[b]
    ? a[b]
    : void 0 !== urlParams && void 0 !== urlParams[b]
      ? urlParams[b]
      : void 0 !== parentUrlParams && void 0 !== parentUrlParams[b]
        ? parentUrlParams[b]
        : SMARTHOME_GRAFANA_DEFAULTS[b]
}
function SmartHomeSubscriber(a) {
  function b(a) {
    var b = a,
      c = "undefined" != typeof b.type
        ? b.type
        : "GET",
      d = "undefined" != typeof b.data
        ? b.data
        : "",
      e = "undefined" != typeof b.headers
        ? b.headers
        : {},
      f = new XMLHttpRequest;
    f.open(c, b.url, !0);
    for (var g in e)
      f.setRequestHeader(g, e[g]);
    return f.onload = function () {
      return f.status < 200 || f.status > 400
        ? void("function" == typeof b.error && b.error(f))
        : void("function" == typeof b.callback && b.callback(f))
    },
    f.onerror = function () {
      "function" == typeof b.error && b.error(f)
    },
    f.send(d),
    f
  }
  function c() {
    var a = [];
    for (var b in o)
      void 0 === o[b].value && a.push(b);
    return a
  }
  function d() {
    return 0 === c().length
  }
  function e() {
    if (!m && d()) {
      m = !0;
      for (var a = 0; a < n.length; a++)
        n[a]()
    }
  }
  function f(a, b) {
    if (o[a].value !== b) {
      o[a].value = b;
      for (var c = o[a].listeners, d = 0; d < c.length; d++) {
        var f = c[d];
        f(a, b)
      }
      e()
    }
  }
  function g(a) {
    var b = this;
    b.navigate = function () {},
    b.source = new EventSource(a),
    b
      .source
      .addEventListener("event", function (a) {
        if (!b.paused) {
          var c,
            d = JSON.parse(a.data),
            e = d.item.name;
          if (void 0 !== o[e]) {
            if ("string" == typeof d.label && d.label.indexOf("[") !== -1 && d.label.indexOf("]") !== -1) {
              var g = d
                .label
                .indexOf("[");
              c = d
                .label
                .substr(g + 1, d.label.lastIndexOf("]") - (g + 1))
            } else
              c = d.item.state;
            f(e, c)
          }
        }
      })
  }
  function h() {
    function a(a) {
      function b(a) {
        a
          .forEach(function (a) {
            if (void 0 !== a.item) {
              var b = a.item.name,
                c = a.item.state;
              void 0 !== o[b] && f(b, c)
            }
          })
      }
      try {
        a = JSON.parse(a)
      } catch (c) {
        return
      }
      a.leaf
        ? b(a.widgets)
        : a
          .widgets
          .forEach(function (a) {
            b(a.widgets)
          })
    }
    function c() {
      var e = Math
        .random()
        .toString(16)
        .slice(2);
      d.request = b({
        url: "/rest/sitemaps/" + p.sitemap + "/" + p.page + "?_=" + e,
        headers: {
          "X-Atmosphere-Transport": "long-polling"
        },
        callback: function (b) {
          a(b.responseText),
          setTimeout(function () {
            c()
          }, 1)
        },
        error: function () {
          setTimeout(function () {
            c()
          }, 1e3)
        }
      })
    }
    var d = this;
    c()
  }
  function i() {
    var a = this;
    a.startSubscriber = function (b) {
      var c,
        d,
        e;
      try {
        c = JSON.parse(b.responseText)
      } catch (f) {
        return
      }
      if ("CREATED" === c.status) {
        try {
          d = c.context.headers.Location[0]
        } catch (f) {
          return
        }
        e = d.split("/"),
        p.id = e[e.length - 1],
        "EventSource" in window
          ? g.call(a, d + "?sitemap=" + p.sitemap + "&pageid=" + p.page)
          : h.call(a)
      }
    },
    b({url: "/rest/sitemaps/events/subscribe", type: "POST", callback: a.startSubscriber})
  }
  function j() {
    var a = this;
    a.valueHandler = function (a) {
      var b;
      try {
        b = JSON.parse(a.responseText)
      } catch (c) {
        return
      }
      f(b.name, b.state)
    };
    for (var d = c(), g = 0; g < d.length; g++)
      b({
        url: "/rest/items/" + d[g],
        type: "GET",
        callback: a.valueHandler
      });
    e()
  }
  function k() {
    void 0 === p.page && (p.page = p.sitemap),
    document.addEventListener("DOMContentLoaded", function () {
      p.valuesInitializer = new j,
      p.changeListener = new i
    })
  }
  var l = a,
    m = !1,
    n = [],
    o = {},
    p = {
      id: "",
      page: resolveParam(l, "w"),
      sitemap: resolveParam(l, "sitemap")
    };
  this.addItemListener = function (a, b) {
    if ("function" != typeof b)
      throw new Error("addItemListener 'listener' is not a function");
    void 0 !== o[a]
      ? o[a]
        .listeners
        .push(b)
      : o[a] = {
        listeners: [b],
        value: void 0
      }
  },
  this.addInitializedListener = function (a) {
    if ("function" != typeof a)
      throw new Error("addInitializedListener 'listener' is not a function");
    n.push(a)
  },
  this.isInitialized = function () {
    return m
  },
  k()
}
function GrafanaPanel(a) {
  function b() {
    var a = p.debug.value,
      c = p.render.value,
      d = p.refresh.value,
      e = document.getElementById(l),
      f = e.contentWindow.document,
      g = m;
    g += "true" === c
      ? o
      : n,
    g += q.dashboard.value;
    var h = !0;
    for (var i in q) {
      var k = q[i].key,
        r = q[i].value;
      "width" === k
        ? r = "false" === c
          ? void 0
          : "auto" === r
            ? f.body.clientWidth
            : r
        : "height" === k && (r = "false" === c
          ? void 0
          : "auto" === r
            ? f.body.clientHeight
            : r),
      void 0 !== k && void 0 !== r && (g += (h
        ? "?"
        : "&") + k + "=" + r, h = !1)
    }
    if ("true" === c && (g += "&cacheBuster=" + Date.now()), "true" === a)
      f.open(),
      f.write('<a href="' + g + '">' + g + "</a>"),
      f.close();
    else if ("true" === c) {
      var s = g.replace(o, n);
      f.open(),
      f.write("<style>body{margin:0px}p{margin:0px}</style>"),
      f.write('<p style="text-align:center;"><a href="' + s + '"><img src="' + g + '"></a></p>'),
      f.close()
    } else
      document
        .getElementById(l)
        .src !== g && e
        .contentWindow
        .location
        .replace(g);

    "true" === c && d > 0
      ? (clearTimeout(j), j = setTimeout(b, d))
      : void 0 !== j && clearTimeout(j)
  }
  function c() {
    "true" !== p.render.value || "auto" !== q.width.value && "auto" !== q.height.value
      ? clearTimeout(k)
      : (clearTimeout(k), k = setTimeout(b, 500))
  }
  function d(a, b, c) {
    for (var d in a)
      void 0 !== a[d].itemName && a[d].itemName === b && (a[d].itemFunction && (c = a[d].itemFunction(c)), a[d].value = c)
  }
  function e(a, c) {
    d(p, a, c),
    d(q, a, c),
    smartHomeSubscriber.isInitialized() && b()
  }
  function f(a, b) {
    if (void 0 === b)
      throw new Error("Property '" + a + "' is undefined")
  }
  function g(a) {
    for (var b in a) {
      var c = a[b].itemName;
      if (void 0 !== c)
        smartHomeSubscriber.addItemListener(c, e);
      else if (void 0 === a[b].value)
        throw new Error("Property '" + b + "' requires a default value or itemName to obtain the value from")
    }
  }
  function h() {
    f("frame", l),
    f("urlPrefix", m),
    f("panelPath", n),
    f("renderPanelPath", o),
    g(p),
    g(q),
    smartHomeSubscriber.addInitializedListener(b),
    window.addEventListener("resize", c)
  }
  var i = a,
    j = void 0,
    k = void 0,
    l = resolveParam(i, "frame"),
    m = resolveParam(i, "urlPrefix"),
    n = resolveParam(i, "panelPath"),
    o = resolveParam(i, "renderPanelPath"),
    p = {
      debug: {
        value: resolveParam(i, "debug"),
        itemName: resolveParam(i, "debugItem"),
        itemFunction: a.debugItemFunction
      },
      render: {
        value: resolveParam(i, "render"),
        itemName: resolveParam(i, "renderItem"),
        itemFunction: a.renderItemFunction
      },
      refresh: {
        value: resolveParam(i, "refresh"),
        itemName: resolveParam(i, "refreshItem"),
        itemFunction: a.refreshItemFunction
      }
    },
    q = {
      dashboard: {
        value: resolveParam(i, "dashboard"),
        itemName: resolveParam(i, "dashboardItem"),
        itemFunction: a.dashboardItemFunction
      },
      from: {
        key: "from",
        value: resolveParam(i, "from"),
        itemName: resolveParam(i, "fromItem"),
        itemFunction: a.fromItemFunction
      },
      to: {
        key: "to",
        value: resolveParam(i, "to"),
        itemName: resolveParam(i, "toItem"),
        itemFunction: a.toItemFunction
      },
      panel: {
        key: "panelId",
        value: resolveParam(i, "panel"),
        itemName: resolveParam(i, "panelItem"),
        itemFunction: a.panelItemFunction
      },
      theme: {
        key: "theme",
        value: resolveParam(i, "theme"),
        itemName: resolveParam(i, "themeItem"),
        itemFunction: a.themeItemFunction
      },
      width: {
        key: "width",
        value: resolveParam(i, "width"),
        itemName: resolveParam(i, "widthItem"),
        itemFunction: a.widthItemFunction
      },
      height: {
        key: "height",
        value: resolveParam(i, "height"),
        itemName: resolveParam(i, "heightItem"),
        itemFunction: a.heightItemFunction
      }
    };
  h()
}
function createGuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (a) {
    var b = 16 * Math.random() | 0,
      c = "x" === a
        ? b
        : 3 & b | 8;
    return c.toString(16)
  })
}
function addGrafanaPanel(a, b) {
  void 0 === a && (a = createGuid());
  var c = document.createElement("div");
  c.id = "panel-" + a + "-container",
  c.className = "panel-container",
  document
    .body
    .appendChild(c);
  var d = document.createElement("iframe");
  d.id = "panel-" + a + "-frame",
  d.className = "panel-frame",
  d.scrolling = "no",
  c.appendChild(d),
  void 0 === b && (b = {}),
  b.frame = d.id;
  var e = new GrafanaPanel(b);
  grafanaPanels.push(e)
}
var SMARTHOME_GRAFANA_DEFAULTS = {
    debug: "false",
    render: "false",
    refresh: "0",
    sitemap: "default",
    urlPrefix: "http://grafana:3000",
    panelPath: "/dashboard-solo/db/",
    renderPanelPath: "/render/dashboard-solo/db/",
    from: "now-1d",
    to: "now",
    theme: "light",
    width: "auto",
    height: "auto"
  },
  urlParams = queryParams(window.location),
  parentUrlParams = queryParams(window.parent.location.href),
  smartHomeSubscriber = new SmartHomeSubscriber,
  grafanaPanels = [];
