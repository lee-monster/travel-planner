// TravelKo - travel.koinfo.kr Main Application
// Requires: sites/travel/lang.js (translations)

(function() {
  'use strict';

  // === Resolve initial language from URL > localStorage > default ===
  var SUPPORTED_LANGS = ['en', 'ko', 'id', 'mn', 'ms', 'vi'];
  function resolveInitialLang() {
    var urlLang = new URLSearchParams(window.location.search).get('lang');
    if (urlLang && SUPPORTED_LANGS.indexOf(urlLang) !== -1) return urlLang;
    var stored = localStorage.getItem('travelko_lang');
    if (stored && SUPPORTED_LANGS.indexOf(stored) !== -1) return stored;
    return 'en';
  }

  // === State ===
  var state = {
    lang: resolveInitialLang(),
    category: 'all',
    region: '',
    search: '',
    spots: [],
    hasMore: false,
    nextCursor: null,
    loading: false,
    selectedSpot: null,
    map: null,
    markers: [],
    infoWindows: [],
    mapLoaded: false,
    mapProvider: localStorage.getItem('travelko_map_provider') || 'naver',
    mapConfig: null,
    // Auth
    authUser: null,
    authToken: null,
    // Bookmarks: [{spotId, type}]
    bookmarks: [],
    activeTab: 'explore',
    // Cache all loaded spots by id for bookmark lookup across filters
    spotCache: {}
  };

  var CAT_ICONS = {
    food: '🍜', attraction: '🏛️', cafe: '☕',
    nature: '🌿', shopping: '🛍️', nightlife: '🌙'
  };

  var CAT_COLORS = {
    food: '#EF4444', attraction: '#3B82F6', cafe: '#F59E0B',
    nature: '#22C55E', shopping: '#8B5CF6', nightlife: '#EC4899'
  };

  // === Map Providers Abstraction ===
  var MapProviders = {
    naver: {
      loadSDK: function(config, lang, cb) {
        var existing = document.getElementById('map-sdk-script');
        if (existing) existing.remove();
        if (state.map) {
          try { state.map.destroy(); } catch(e) {}
          state.map = null;
          window._taMap = null;
        }
        var script = document.createElement('script');
        script.id = 'map-sdk-script';
        script.src = 'https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=' + config.clientId + '&submodules=geocoder&language=' + lang;
        script.onload = function() { cb(); };
        script.onerror = function() { cb(new Error('Failed to load Naver Map SDK')); };
        document.head.appendChild(script);
      },
      createMap: function(elementId) {
        var map = new naver.maps.Map(elementId, {
          center: new naver.maps.LatLng(37.5665, 126.978),
          zoom: 7,
          mapTypeControl: false,
          zoomControl: true,
          zoomControlOptions: { position: naver.maps.Position.RIGHT_CENTER },
          scaleControl: true,
          scaleControlOptions: { position: naver.maps.Position.RIGHT_BOTTOM }
        });
        return map;
      },
      addMarker: function(map, lat, lng, color, icon) {
        return new naver.maps.Marker({
          position: new naver.maps.LatLng(lat, lng),
          map: map,
          icon: {
            content: '<div style="width:30px;height:30px;background:' + color + ';border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px;">' + icon + '</div>',
            anchor: new naver.maps.Point(15, 15)
          }
        });
      },
      createInfoWindow: function(html) {
        return new naver.maps.InfoWindow({
          content: html, borderWidth: 0, backgroundColor: 'transparent',
          anchorSize: new naver.maps.Size(0, 0), pixelOffset: new naver.maps.Point(0, -20)
        });
      },
      openInfoWindow: function(iw, map, marker) { iw.open(map, marker); },
      closeInfoWindow: function(iw) { iw.close(); },
      removeMarker: function(m) { m.setMap(null); },
      onMarkerClick: function(marker, cb) { naver.maps.Event.addListener(marker, 'click', cb); },
      panTo: function(map, lat, lng) { map.panTo(new naver.maps.LatLng(lat, lng)); },
      getCenter: function(map) { var c = map.getCenter(); return { lat: c.lat(), lng: c.lng() }; },
      setCenter: function(map, lat, lng) { map.setCenter(new naver.maps.LatLng(lat, lng)); },
      getZoom: function(map) { return map.getZoom(); },
      setZoom: function(map, z) { map.setZoom(z); },
      triggerResize: function(map) { naver.maps.Event.trigger(map, 'resize'); },
      fitBounds: function(map, spots) {
        var bounds = new naver.maps.LatLngBounds();
        spots.forEach(function(s) { if (s.lat && s.lng) bounds.extend(new naver.maps.LatLng(s.lat, s.lng)); });
        map.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 50 });
      },
      addControlElement: function(map, el) {
        map.controls[naver.maps.Position.TOP_LEFT].push(el);
      },
      geocode: function(query, cb) {
        if (typeof naver === 'undefined' || !naver.maps || !naver.maps.Service) { cb(null); return; }
        naver.maps.Service.geocode({ query: query }, function(status, response) {
          if (status === naver.maps.Service.Status.OK && response.v2.addresses.length) {
            var item = response.v2.addresses[0];
            cb({ lat: parseFloat(item.y), lng: parseFloat(item.x) });
          } else { cb(null); }
        });
      },
      getExternalMapUrl: function(spot) {
        if (spot.naverMapLink) return spot.naverMapLink;
        return 'https://map.naver.com/p/search/' + spot.lat + ',' + spot.lng + '?c=' + spot.lng + ',' + spot.lat + ',15,0,0,0,dh';
      }
    },

    google: {
      loadSDK: function(config, lang, cb) {
        var existing = document.getElementById('map-sdk-script');
        if (existing) existing.remove();
        state.map = null;
        window._taMap = null;
        var script = document.createElement('script');
        script.id = 'map-sdk-script';
        script.src = 'https://maps.googleapis.com/maps/api/js?key=' + config.googleKey + '&language=' + lang;
        script.onload = function() { cb(); };
        script.onerror = function() { cb(new Error('Failed to load Google Maps SDK')); };
        document.head.appendChild(script);
      },
      createMap: function(elementId) {
        return new google.maps.Map(document.getElementById(elementId), {
          center: { lat: 37.5665, lng: 126.978 },
          zoom: 7,
          mapTypeControl: false,
          zoomControl: true,
          streetViewControl: false,
          fullscreenControl: false
        });
      },
      _svgIcon: function(color, icon) {
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30">' +
          '<circle cx="15" cy="15" r="12" fill="' + color + '" stroke="white" stroke-width="3"/>' +
          '<text x="15" y="19" text-anchor="middle" font-size="13">' + icon + '</text>' +
          '</svg>';
        return {
          url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
          scaledSize: new google.maps.Size(30, 30),
          anchor: new google.maps.Point(15, 15)
        };
      },
      addMarker: function(map, lat, lng, color, icon) {
        return new google.maps.Marker({
          position: { lat: lat, lng: lng },
          map: map,
          icon: this._svgIcon(color, icon)
        });
      },
      createInfoWindow: function(html) {
        return new google.maps.InfoWindow({ content: html });
      },
      openInfoWindow: function(iw, map, marker) { iw.open(map, marker); },
      closeInfoWindow: function(iw) { iw.close(); },
      removeMarker: function(m) { m.setMap(null); },
      onMarkerClick: function(marker, cb) { marker.addListener('click', cb); },
      panTo: function(map, lat, lng) { map.panTo({ lat: lat, lng: lng }); },
      getCenter: function(map) { var c = map.getCenter(); return { lat: c.lat(), lng: c.lng() }; },
      setCenter: function(map, lat, lng) { map.setCenter({ lat: lat, lng: lng }); },
      getZoom: function(map) { return map.getZoom(); },
      setZoom: function(map, z) { map.setZoom(z); },
      triggerResize: function(map) { google.maps.event.trigger(map, 'resize'); },
      fitBounds: function(map, spots) {
        var bounds = new google.maps.LatLngBounds();
        spots.forEach(function(s) { if (s.lat && s.lng) bounds.extend({ lat: s.lat, lng: s.lng }); });
        map.fitBounds(bounds, 50);
      },
      addControlElement: function(map, el) {
        map.controls[google.maps.ControlPosition.TOP_LEFT].push(el);
      },
      geocode: function(query, cb) {
        if (typeof google === 'undefined' || !google.maps) { cb(null); return; }
        var geocoder = new google.maps.Geocoder();
        geocoder.geocode({ address: query }, function(results, status) {
          if (status === 'OK' && results.length) {
            var loc = results[0].geometry.location;
            cb({ lat: loc.lat(), lng: loc.lng() });
          } else { cb(null); }
        });
      },
      getExternalMapUrl: function(spot) {
        return 'https://www.google.com/maps/search/?api=1&query=' + spot.lat + ',' + spot.lng;
      }
    }
  };

  function mp() {
    return MapProviders[state.mapProvider] || MapProviders.naver;
  }

  // === i18n ===
  function t(key) {
    var lang = state.lang;
    if (translations && translations[lang] && translations[lang][key]) {
      return translations[lang][key];
    }
    if (translations && translations.en && translations.en[key]) {
      return translations.en[key];
    }
    return key;
  }

  function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(function(el) {
      var key = el.getAttribute('data-i18n');
      el.textContent = t(key);
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(function(el) {
      var key = el.getAttribute('data-i18n-ph');
      el.placeholder = t(key);
    });
    var toggleBtns = document.querySelectorAll('.ta-map-provider-btn');
    toggleBtns.forEach(function(btn) {
      if (btn.dataset.provider === 'naver') btn.textContent = t('app.mapNaver');
      if (btn.dataset.provider === 'google') btn.textContent = t('app.mapGoogle');
    });
  }

  // === Language ===
  window.taSetLanguage = function(lang) {
    state.lang = lang;
    localStorage.setItem('travelko_lang', lang);
    document.getElementById('ta-lang-select').value = lang;
    updateUrlLang(lang);
    updateSeoMeta(lang);
    applyTranslations();
    // Re-fetch spots in the new language from API
    fetchSpots(false);
    renderMySpots();
    if (state.map && state.mapLoaded) {
      var p = mp();
      var center = p.getCenter(state.map);
      var zoom = p.getZoom(state.map);
      loadAndCreateMap(center, zoom);
    }
  };

  // Update URL ?lang= parameter without page reload
  function updateUrlLang(lang) {
    var url = new URL(window.location.href);
    url.searchParams.set('lang', lang);
    window.history.replaceState(null, '', url.toString());
  }

  // Update SEO meta tags, hreflang, canonical, html lang
  function updateSeoMeta(lang) {
    var t = (typeof translations !== 'undefined') ? translations : {};
    var langData = t[lang] || t['en'] || {};
    var baseUrl = 'https://travel.koinfo.kr';

    // html lang attribute
    document.documentElement.lang = lang;

    // title
    var title = langData['seo.title'] || 'TravelKo - Discover Korea';
    document.title = title;

    // meta description
    var descMeta = document.querySelector('meta[name="description"]');
    if (descMeta) descMeta.content = langData['seo.description'] || '';

    // og tags
    var ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.content = title;
    var ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.content = langData['seo.description'] || '';

    // og:locale
    var localeMap = { en: 'en_US', ko: 'ko_KR', id: 'id_ID', mn: 'mn_MN', ms: 'ms_MY', vi: 'vi_VN' };
    var ogLocale = document.querySelector('meta[property="og:locale"]');
    if (ogLocale) ogLocale.content = localeMap[lang] || 'en_US';

    // og:url
    var currentUrl = baseUrl + '/?lang=' + lang;
    var ogUrl = document.querySelector('meta[property="og:url"]');
    if (ogUrl) ogUrl.content = currentUrl;

    // canonical
    var canonical = document.getElementById('seo-canonical');
    if (canonical) canonical.href = currentUrl;

    // twitter tags
    var twTitle = document.querySelector('meta[name="twitter:title"]');
    if (twTitle) twTitle.content = title;
    var twDesc = document.querySelector('meta[name="twitter:description"]');
    if (twDesc) twDesc.content = langData['seo.description'] || '';

    // hreflang: remove old, create new
    var oldLinks = document.querySelectorAll('link[rel="alternate"][hreflang]');
    for (var i = 0; i < oldLinks.length; i++) oldLinks[i].remove();

    var head = document.head;
    var params = new URLSearchParams(window.location.search);
    // Build base path preserving non-lang params
    params.delete('lang');
    var extraParams = params.toString();

    SUPPORTED_LANGS.forEach(function(l) {
      var link = document.createElement('link');
      link.rel = 'alternate';
      link.hreflang = l;
      link.href = baseUrl + '/?lang=' + l + (extraParams ? '&' + extraParams : '');
      head.appendChild(link);
    });
    // x-default points to English
    var xdef = document.createElement('link');
    xdef.rel = 'alternate';
    xdef.hreflang = 'x-default';
    xdef.href = baseUrl + '/' + (extraParams ? '?' + extraParams : '');
    head.appendChild(xdef);
  }

  function initLanguage() {
    var select = document.getElementById('ta-lang-select');
    select.value = state.lang;
    localStorage.setItem('travelko_lang', state.lang);
    updateUrlLang(state.lang);
    updateSeoMeta(state.lang);
  }

  // === Auth ===
  function initAuth() {
    // Restore session from localStorage
    var savedToken = localStorage.getItem('travelko_token');
    var savedUser = localStorage.getItem('travelko_user');
    if (savedToken && savedUser) {
      try {
        state.authToken = savedToken;
        state.authUser = JSON.parse(savedUser);
        updateAuthUI();
        fetchBookmarks();
      } catch (e) {
        clearAuthData();
      }
    }

    // Init Google Identity Services when ready
    initGoogleSignIn();

    // Avatar click toggle menu
    var profile = document.getElementById('ta-auth-profile');
    if (profile) {
      profile.addEventListener('click', function(e) {
        e.stopPropagation();
        profile.classList.toggle('open');
      });
      document.addEventListener('click', function() {
        profile.classList.remove('open');
      });
    }
  }

  function initGoogleSignIn() {
    if (typeof google === 'undefined' || !google.accounts || !window._taGoogleClientId) {
      // GIS or Client ID not ready yet, retry
      setTimeout(initGoogleSignIn, 500);
      return;
    }
    google.accounts.id.initialize({
      client_id: window._taGoogleClientId,
      callback: handleGoogleCredential,
      auto_select: false
    });
  }

  window.taGoogleSignIn = function() {
    if (typeof google !== 'undefined' && google.accounts && window._taGoogleClientId) {
      google.accounts.id.prompt(function(notification) {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          // Fallback: use popup
          google.accounts.id.renderButton(
            document.createElement('div'), { type: 'standard' }
          );
          // Try One Tap again or show popup
          google.accounts.oauth2.initCodeClient({
            client_id: window._taGoogleClientId,
            scope: 'openid email profile',
            callback: function() {}
          });
          // Use the simpler approach: render and auto-click
          var tmpDiv = document.createElement('div');
          tmpDiv.style.position = 'fixed';
          tmpDiv.style.top = '50%';
          tmpDiv.style.left = '50%';
          tmpDiv.style.transform = 'translate(-50%, -50%)';
          tmpDiv.style.zIndex = '9999';
          tmpDiv.style.background = 'white';
          tmpDiv.style.padding = '40px';
          tmpDiv.style.borderRadius = '12px';
          tmpDiv.style.boxShadow = '0 10px 40px rgba(0,0,0,0.3)';
          tmpDiv.id = 'ta-google-popup';

          var closeBtn = document.createElement('button');
          closeBtn.textContent = '✕';
          closeBtn.style.cssText = 'position:absolute;top:10px;right:14px;border:none;background:none;font-size:1.2rem;cursor:pointer;color:#666;';
          closeBtn.onclick = function() { tmpDiv.remove(); };
          tmpDiv.appendChild(closeBtn);

          var btnContainer = document.createElement('div');
          tmpDiv.appendChild(btnContainer);
          document.body.appendChild(tmpDiv);

          google.accounts.id.renderButton(btnContainer, {
            theme: 'outline',
            size: 'large',
            text: 'signin_with',
            shape: 'rectangular',
            width: 280
          });
        }
      });
    } else {
      showToast(t('auth.signIn') + ' - Google not available');
    }
  };

  function handleGoogleCredential(response) {
    // Remove popup if exists
    var popup = document.getElementById('ta-google-popup');
    if (popup) popup.remove();

    if (!response || !response.credential) {
      console.error('No credential in Google response:', response);
      showToast('Sign in failed. Please try again.');
      return;
    }

    fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: response.credential })
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (data.success) {
        state.authToken = data.token;
        state.authUser = data.user;
        localStorage.setItem('travelko_token', data.token);
        localStorage.setItem('travelko_user', JSON.stringify(data.user));
        updateAuthUI();
        fetchBookmarks();
        showToast(t('auth.welcome') + ', ' + data.user.name + '!');
      } else {
        console.error('Auth failed:', data);
        showToast('Sign in failed: ' + (data.error || 'Unknown error'));
      }
    })
    .catch(function(err) {
      console.error('Auth error:', err);
      showToast('Sign in failed. Please try again.');
    });
  }

  window.taSignOut = function() {
    clearAuthData();
    state.bookmarks = [];
    updateAuthUI();
    renderMySpots();
    if (state.selectedSpot) renderDetail(state.selectedSpot);
    renderSpotList();
  };

  function clearAuthData() {
    state.authToken = null;
    state.authUser = null;
    localStorage.removeItem('travelko_token');
    localStorage.removeItem('travelko_user');
  }

  function updateAuthUI() {
    var loginBtn = document.getElementById('ta-auth-login');
    var profileEl = document.getElementById('ta-auth-profile');
    var avatarEl = document.getElementById('ta-auth-avatar');
    var nameEl = document.getElementById('ta-auth-name');

    if (state.authUser) {
      loginBtn.style.display = 'none';
      profileEl.style.display = '';
      avatarEl.src = state.authUser.avatar || '';
      avatarEl.alt = state.authUser.name;
      nameEl.textContent = state.authUser.name;
    } else {
      loginBtn.style.display = '';
      profileEl.style.display = 'none';
    }
  }

  function authHeaders() {
    var h = { 'Content-Type': 'application/json' };
    if (state.authToken) h['Authorization'] = 'Bearer ' + state.authToken;
    return h;
  }

  // === Bookmarks ===
  function fetchBookmarks() {
    if (!state.authToken) return;
    fetch('/api/user/bookmarks', { headers: authHeaders() })
      .then(function(res) { return res.json(); })
      .then(function(data) {
        state.bookmarks = data.bookmarks || [];
        renderMySpots();
        renderSpotList();
        if (state.selectedSpot) renderDetail(state.selectedSpot);
      })
      .catch(function() {});
  }

  function toggleBookmark(spotId, type) {
    if (!state.authUser) {
      showToast(t('bookmark.loginRequired'));
      return;
    }

    var existing = state.bookmarks.find(function(b) { return b.spotId === spotId && b.type === type; });
    var action = existing ? 'remove' : 'add';

    // Optimistic update
    if (action === 'add') {
      state.bookmarks = state.bookmarks.filter(function(b) { return b.spotId !== spotId; });
      state.bookmarks.push({ spotId: spotId, type: type });
    } else {
      state.bookmarks = state.bookmarks.filter(function(b) { return !(b.spotId === spotId && b.type === type); });
    }

    renderMySpots();
    renderSpotList();
    if (state.selectedSpot) renderDetail(state.selectedSpot);
    showToast(action === 'add' ? t('bookmark.saved') : t('bookmark.removed'));

    // Server sync
    fetch('/api/user/bookmarks', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ spotId: spotId, type: type, action: action })
    }).catch(function() {});
  }

  function getBookmarkType(spotId) {
    var bm = state.bookmarks.find(function(b) { return b.spotId === spotId; });
    return bm ? bm.type : null;
  }

  // === Tabs ===
  window.taSwitchTab = function(tab) {
    state.activeTab = tab;
    document.querySelectorAll('.ta-tab').forEach(function(t) {
      t.classList.toggle('active', t.dataset.tab === tab);
    });
    document.querySelectorAll('.ta-tab-content').forEach(function(c) {
      c.classList.remove('active');
      c.style.display = '';
    });
    var contentId = tab === 'explore' ? 'ta-tab-explore' : 'ta-tab-myspots';
    document.getElementById(contentId).classList.add('active');

    if (tab === 'myspots') {
      renderMySpots();
    }
  };

  window.taShowMySpots = function() {
    document.getElementById('ta-auth-profile').classList.remove('open');
    if (state.selectedSpot) taBackToList();
    taSwitchTab('myspots');
  };

  // === Render My Spots ===
  function renderMySpots() {
    var visitEl = document.getElementById('ta-myspots-visit');
    var interestedEl = document.getElementById('ta-myspots-interested');
    var plannerCta = document.getElementById('ta-planner-cta');
    if (!visitEl) return;

    if (!state.authUser) {
      visitEl.innerHTML = '<div class="ta-myspots-empty">' + t('bookmark.loginRequired') + '</div>';
      interestedEl.innerHTML = '';
      if (plannerCta) plannerCta.style.display = 'none';
      return;
    }

    var visitSpots = [];
    var interestedSpots = [];

    state.bookmarks.forEach(function(bm) {
      var spot = state.spots.find(function(s) { return s.id === bm.spotId; }) || state.spotCache[bm.spotId];
      if (!spot) return;
      if (bm.type === 'want_to_visit') visitSpots.push(spot);
      else if (bm.type === 'interested') interestedSpots.push(spot);
    });

    visitEl.innerHTML = visitSpots.length === 0
      ? '<div class="ta-myspots-empty">' + t('bookmark.wantToVisitEmpty') + '</div>'
      : visitSpots.map(function(s) { return renderMySpotItem(s, 'want_to_visit'); }).join('');

    interestedEl.innerHTML = interestedSpots.length === 0
      ? '<div class="ta-myspots-empty">' + t('bookmark.interestedEmpty') + '</div>'
      : interestedSpots.map(function(s) { return renderMySpotItem(s, 'interested'); }).join('');

    // Show planner CTA if there are want_to_visit spots
    if (plannerCta) {
      plannerCta.style.display = visitSpots.length > 0 ? 'flex' : 'none';
    }

    // Bind events
    visitEl.querySelectorAll('.ta-myspot-item').forEach(bindMySpotEvents);
    interestedEl.querySelectorAll('.ta-myspot-item').forEach(bindMySpotEvents);
  }

  function renderMySpotItem(spot, type) {
    var icon = CAT_ICONS[spot.category] || '📍';
    return '<div class="ta-myspot-item" data-id="' + spot.id + '" data-type="' + type + '">' +
      '<span class="ta-myspot-icon">' + icon + '</span>' +
      '<span class="ta-myspot-name">' + escapeHtml(spot.name) + '</span>' +
      '<button class="ta-myspot-remove" data-id="' + spot.id + '" data-type="' + type + '" title="' + t('bookmark.remove') + '">✕</button>' +
    '</div>';
  }

  function bindMySpotEvents(item) {
    item.addEventListener('click', function(e) {
      if (e.target.closest('.ta-myspot-remove')) {
        var id = e.target.closest('.ta-myspot-remove').dataset.id;
        var type = e.target.closest('.ta-myspot-remove').dataset.type;
        toggleBookmark(id, type);
        return;
      }
      var spotId = item.dataset.id;
      var spot = state.spots.find(function(s) { return s.id === spotId; });
      if (spot) showDetail(spot);
    });
  }

  // === API ===
  function fetchSpots(append) {
    if (state.loading) return;
    state.loading = true;

    var loadingEl = document.getElementById('ta-loading');
    if (!append) {
      loadingEl.textContent = t('app.loading');
      loadingEl.style.display = '';
    }

    var params = new URLSearchParams();
    params.set('lang', state.lang);
    params.set('limit', '100');
    if (state.category !== 'all') params.set('category', state.category);
    if (state.region) params.set('region', state.region);
    if (append && state.nextCursor) params.set('cursor', state.nextCursor);

    fetch('/api/travel-spots?' + params.toString())
      .then(function(res) { return res.json(); })
      .then(function(data) {
        if (append) {
          state.spots = state.spots.concat(data.items || []);
        } else {
          state.spots = data.items || [];
        }
        // Cache all spots for bookmark lookup across filters
        state.spots.forEach(function(s) { state.spotCache[s.id] = s; });
        state.hasMore = data.hasMore || false;
        state.nextCursor = data.nextCursor || null;
        state.loading = false;

        var filtered = filterBySearch(state.spots);
        renderSpotList(filtered);
        renderMapMarkers(filtered);
        renderMySpots();
      })
      .catch(function() {
        state.loading = false;
        loadingEl.textContent = t('app.noResults');
        loadingEl.style.display = '';
      });
  }

  function filterBySearch(spots) {
    if (!state.search) return spots;
    var q = state.search.toLowerCase();
    return spots.filter(function(s) {
      return (s.name && s.name.toLowerCase().includes(q)) ||
             (s.description && s.description.toLowerCase().includes(q)) ||
             (s.address && s.address.toLowerCase().includes(q)) ||
             (s.tags && s.tags.join(' ').toLowerCase().includes(q));
    });
  }

  // === Render Spot List ===
  function renderSpotList(spots) {
    spots = spots || filterBySearch(state.spots);
    var listEl = document.getElementById('ta-list');
    var loadingEl = document.getElementById('ta-loading');

    if (spots.length === 0) {
      loadingEl.textContent = t('app.noResults');
      loadingEl.style.display = '';
      listEl.querySelectorAll('.ta-spot-card, .ta-load-more').forEach(function(el) { el.remove(); });
      return;
    }

    loadingEl.style.display = 'none';

    var html = spots.map(function(spot) {
      var catClass = 'cat-' + (spot.category || 'attraction');
      var thumb = spot.coverImage
        ? '<div class="ta-spot-thumb"><img src="' + escapeAttr(spot.coverImage) + '" alt="' + escapeAttr(spot.name) + '" loading="lazy"></div>'
        : '<div class="ta-spot-thumb"><span class="ta-spot-thumb-empty">' + (CAT_ICONS[spot.category] || '📍') + '</span></div>';

      var meta = '';
      if (spot.featured) meta += '<span class="ta-spot-featured">' + t('app.featured') + '</span>';
      if (spot.rating) meta += '<span class="ta-spot-rating">★ ' + spot.rating.toFixed(1) + '</span>';
      if (spot.region) meta += '<span>' + spot.region + '</span>';

      // Bookmark badge
      var bmType = getBookmarkType(spot.id);
      var badge = '';
      if (bmType === 'want_to_visit') badge = '<span class="ta-spot-bookmark-badge visit" title="' + t('bookmark.wantToVisit') + '"></span>';
      else if (bmType === 'interested') badge = '<span class="ta-spot-bookmark-badge interested" title="' + t('bookmark.interested') + '"></span>';

      return '<div class="ta-spot-card" data-id="' + spot.id + '">' +
        thumb +
        '<div class="ta-spot-info">' +
          '<span class="ta-spot-cat ' + catClass + '">' + getCatLabel(spot.category) + '</span>' +
          '<div class="ta-spot-name">' + escapeHtml(spot.name) + badge + '</div>' +
          '<div class="ta-spot-meta">' + meta + '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    if (state.hasMore) {
      html += '<button class="ta-load-more" id="ta-load-more">' + t('app.loadMore') + '</button>';
    }

    listEl.querySelectorAll('.ta-spot-card, .ta-load-more').forEach(function(el) { el.remove(); });
    listEl.insertAdjacentHTML('beforeend', html);

    listEl.querySelectorAll('.ta-spot-card').forEach(function(card) {
      card.addEventListener('click', function() {
        var id = card.getAttribute('data-id');
        var spot = state.spots.find(function(s) { return s.id === id; });
        if (spot) showDetail(spot);
      });
    });

    var loadMoreBtn = document.getElementById('ta-load-more');
    if (loadMoreBtn) {
      loadMoreBtn.addEventListener('click', function() { fetchSpots(true); });
    }
  }

  function getCatLabel(cat) {
    var key = 'app.cat' + cat.charAt(0).toUpperCase() + cat.slice(1);
    return t(key);
  }

  // === Detail Panel ===
  function showDetail(spot) {
    state.selectedSpot = spot;

    // Hide tabs content, show detail
    document.getElementById('ta-tab-explore').style.display = 'none';
    document.getElementById('ta-tab-myspots').style.display = 'none';
    document.getElementById('ta-tabs').style.display = 'none';
    document.querySelector('.ta-search-wrap').style.display = 'none';
    var detail = document.getElementById('ta-detail');
    detail.classList.add('active');

    renderDetail(spot);
    highlightMarker(spot);

    document.querySelectorAll('.ta-spot-card').forEach(function(c) { c.classList.remove('active'); });
    var card = document.querySelector('.ta-spot-card[data-id="' + spot.id + '"]');
    if (card) card.classList.add('active');
  }

  function renderDetail(spot) {
    // Images
    var imagesEl = document.getElementById('ta-detail-images');
    var allImages = [];
    if (spot.coverImage) allImages.push(spot.coverImage);
    if (spot.photos) allImages = allImages.concat(spot.photos);
    allImages = allImages.filter(function(v, i, a) { return a.indexOf(v) === i; });

    if (allImages.length > 0) {
      imagesEl.innerHTML = allImages.map(function(url) {
        return '<img src="' + escapeAttr(url) + '" alt="' + escapeAttr(spot.name) + '">';
      }).join('');
      imagesEl.style.display = '';
    } else {
      imagesEl.innerHTML = '<div class="ta-detail-photos-loading"></div>';
      imagesEl.style.display = '';
    }

    // Fetch Google Places photos if few/no images
    if (allImages.length < 3 && spot.lat && spot.lng) {
      fetchPlacePhotos(spot, imagesEl, allImages);
    }

    // Category badge
    var catEl = document.getElementById('ta-detail-cat');
    catEl.textContent = getCatLabel(spot.category);
    catEl.className = 'ta-spot-cat cat-' + (spot.category || 'attraction');

    // Name
    document.getElementById('ta-detail-name').textContent = spot.name;

    // Bookmark buttons
    var bmEl = document.getElementById('ta-detail-bookmarks');
    var bmType = getBookmarkType(spot.id);
    bmEl.innerHTML =
      '<button class="ta-bookmark-btn' + (bmType === 'want_to_visit' ? ' active-visit' : '') + '" onclick="taToggleBookmark(\'' + spot.id + '\', \'want_to_visit\')">' +
        '<svg viewBox="0 0 24 24" fill="' + (bmType === 'want_to_visit' ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2"><path d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z"/></svg>' +
        t('bookmark.wantToVisit') +
      '</button>' +
      '<button class="ta-bookmark-btn' + (bmType === 'interested' ? ' active-interested' : '') + '" onclick="taToggleBookmark(\'' + spot.id + '\', \'interested\')">' +
        '<svg viewBox="0 0 24 24" fill="' + (bmType === 'interested' ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2"><path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"/></svg>' +
        t('bookmark.interested') +
      '</button>';

    // Meta
    var metaHtml = '';
    if (spot.rating) metaHtml += '<span class="ta-detail-stars">★ ' + spot.rating.toFixed(1) + '</span>';
    if (spot.featured) metaHtml += '<span style="color:var(--t-primary);font-weight:600;">' + t('app.featured') + '</span>';
    if (spot.region) metaHtml += '<span>' + escapeHtml(spot.region) + '</span>';
    if (spot.submittedBy) metaHtml += '<span>by ' + escapeHtml(spot.submittedBy) + '</span>';
    document.getElementById('ta-detail-meta').innerHTML = metaHtml;

    // Tags
    var tagsHtml = '';
    if (spot.instagram) {
      var igTags = spot.instagram.split(/[\s,]+/).filter(Boolean);
      igTags.forEach(function(tag) {
        var clean = tag.replace(/^[@#]/, '');
        if (tag.startsWith('@')) {
          tagsHtml += '<a href="https://instagram.com/' + encodeURIComponent(clean) + '" target="_blank" rel="noopener" class="ta-detail-tag ta-detail-tag-ig">@' + escapeHtml(clean) + '</a>';
        } else {
          tagsHtml += '<a href="https://instagram.com/explore/tags/' + encodeURIComponent(clean) + '" target="_blank" rel="noopener" class="ta-detail-tag ta-detail-tag-ig">#' + escapeHtml(clean) + '</a>';
        }
      });
    }
    if (spot.tags && spot.tags.length > 0) {
      spot.tags.forEach(function(tag) {
        tagsHtml += '<span class="ta-detail-tag ta-detail-tag-tag">' + escapeHtml(tag) + '</span>';
      });
    }
    document.getElementById('ta-detail-tags').innerHTML = tagsHtml;

    // Description
    document.getElementById('ta-detail-desc').textContent = spot.description || '';

    // Address
    var addrEl = document.getElementById('ta-detail-address');
    if (spot.address) {
      addrEl.innerHTML = escapeHtml(spot.address);
      addrEl.style.display = '';
    } else {
      addrEl.style.display = 'none';
    }

    // Actions
    var actionsEl = document.getElementById('ta-detail-actions');
    var actionsHtml = '';
    if (spot.lat && spot.lng) {
      var p = mp();
      var mapUrl = p.getExternalMapUrl(spot);
      var isGoogle = state.mapProvider === 'google';
      var btnClass = isGoogle ? 'ta-detail-google' : 'ta-detail-naver';
      var label = isGoogle ? t('app.openGoogle') : t('app.openNaver');
      actionsHtml += '<a href="' + escapeAttr(mapUrl) + '" target="_blank" rel="noopener" class="' + btnClass + '">' + label + '</a>';
    } else if (spot.naverMapLink) {
      actionsHtml += '<a href="' + escapeAttr(spot.naverMapLink) + '" target="_blank" rel="noopener" class="ta-detail-naver">' + t('app.openNaver') + '</a>';
    }
    actionsEl.innerHTML = actionsHtml;

    // Submitted by
    var byEl = document.getElementById('ta-detail-by');
    if (spot.submittedBy) {
      byEl.textContent = 'Submitted by ' + spot.submittedBy;
      byEl.style.display = '';
    } else {
      byEl.style.display = 'none';
    }
  }

  window.taToggleBookmark = function(spotId, type) {
    toggleBookmark(spotId, type);
  };

  window.taBackToList = function() {
    state.selectedSpot = null;
    document.getElementById('ta-detail').classList.remove('active');
    document.getElementById('ta-tabs').style.display = '';
    document.querySelector('.ta-search-wrap').style.display = '';

    // Restore active tab content
    var activeTab = state.activeTab;
    if (activeTab === 'explore') {
      document.getElementById('ta-tab-explore').style.display = '';
    } else {
      document.getElementById('ta-tab-myspots').style.display = '';
    }

    document.querySelectorAll('.ta-spot-card').forEach(function(c) { c.classList.remove('active'); });
  };

  // === Map ===
  function getMapLang() {
    var lang = state.lang;
    if (state.mapProvider === 'naver') {
      var supported = { ko: 'ko', en: 'en' };
      return supported[lang] || 'en';
    }
    return lang;
  }

  function initMap() {
    fetch('/api/map-config')
      .then(function(res) { return res.json(); })
      .then(function(data) {
        state.mapConfig = data;

        // Store Google Client ID for auth
        if (data.googleClientId) {
          window._taGoogleClientId = data.googleClientId;
        }

        if (state.mapProvider === 'google' && !data.googleKey) {
          state.mapProvider = 'naver';
          localStorage.setItem('travelko_map_provider', 'naver');
        }
        if (!data.clientId && !data.googleKey) {
          showMapFallback(t('app.mapError'));
          return;
        }
        if (!data.clientId && data.googleKey) {
          state.mapProvider = 'google';
          localStorage.setItem('travelko_map_provider', 'google');
        }

        loadAndCreateMap();
      })
      .catch(function() {
        showMapFallback(t('app.mapError'));
      });
  }

  function loadAndCreateMap(restoreCenter, restoreZoom) {
    var p = mp();
    state.mapLoaded = false;
    state.markers = [];
    state.infoWindows = [];

    p.loadSDK(state.mapConfig, getMapLang(), function(err) {
      if (err) {
        showMapFallback(t('app.mapError'));
        return;
      }
      createMap(restoreCenter, restoreZoom);
    });
  }

  function showMapFallback(msg) {
    var mapEl = document.getElementById('ta-map');
    mapEl.innerHTML = '<div class="ta-map-fallback"><p>' + escapeHtml(msg) + '</p></div>';
  }

  function createMap(restoreCenter, restoreZoom) {
    var p = mp();
    window._taMap = state.map = p.createMap('ta-map');
    state.mapLoaded = true;

    if (restoreCenter) {
      p.setCenter(state.map, restoreCenter.lat, restoreCenter.lng);
    }
    if (restoreZoom) {
      p.setZoom(state.map, restoreZoom);
    }

    addMapProviderToggle();
    addMapTypeToggle();

    if (state.spots.length > 0) {
      renderMapMarkers(filterBySearch(state.spots));
    }
  }

  // === Map Provider Toggle ===
  function addMapProviderToggle() {
    if (!state.mapConfig || !state.mapConfig.clientId || !state.mapConfig.googleKey) return;

    var existing = document.querySelector('.ta-map-provider');
    if (existing) existing.remove();

    var html = '<div class="ta-map-provider">' +
      '<button class="ta-map-provider-btn' + (state.mapProvider === 'naver' ? ' active' : '') + '" data-provider="naver">' + t('app.mapNaver') + '</button>' +
      '<button class="ta-map-provider-btn' + (state.mapProvider === 'google' ? ' active' : '') + '" data-provider="google">' + t('app.mapGoogle') + '</button>' +
    '</div>';

    var el = document.createElement('div');
    el.innerHTML = html;
    var control = el.firstChild;

    control.addEventListener('click', function(e) {
      var btn = e.target.closest('.ta-map-provider-btn');
      if (!btn || btn.dataset.provider === state.mapProvider) return;
      switchMapProvider(btn.dataset.provider);
    });

    document.querySelector('.ta-map-wrap').appendChild(control);
  }

  // === Map Type Toggle ===
  function addMapTypeToggle() {
    var existing = document.querySelector('.ta-map-type');
    if (existing) existing.remove();

    var isNaver = state.mapProvider === 'naver';
    var currentType = isNaver
      ? (state.map.getMapTypeId && state.map.getMapTypeId() === 'satellite' ? 'satellite' : 'normal')
      : (state.map.getMapTypeId && state.map.getMapTypeId() === 'satellite' ? 'satellite' : 'normal');

    var html = '<div class="ta-map-type">' +
      '<button class="ta-map-type-btn' + (currentType === 'normal' ? ' active' : '') + '" data-type="normal">Map</button>' +
      '<button class="ta-map-type-btn' + (currentType === 'satellite' ? ' active' : '') + '" data-type="satellite">Satellite</button>' +
    '</div>';

    var el = document.createElement('div');
    el.innerHTML = html;
    var control = el.firstChild;

    control.addEventListener('click', function(e) {
      var btn = e.target.closest('.ta-map-type-btn');
      if (!btn) return;
      var type = btn.dataset.type;

      control.querySelectorAll('.ta-map-type-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');

      if (state.mapProvider === 'naver') {
        state.map.setMapTypeId(type === 'satellite' ? naver.maps.MapTypeId.SATELLITE : naver.maps.MapTypeId.NORMAL);
      } else {
        state.map.setMapTypeId(type === 'satellite' ? 'satellite' : 'roadmap');
      }
    });

    document.querySelector('.ta-map-wrap').appendChild(control);
  }

  function switchMapProvider(provider) {
    var p = mp();
    var center = null;
    var zoom = null;

    if (state.map && state.mapLoaded) {
      center = p.getCenter(state.map);
      zoom = p.getZoom(state.map);
    }

    state.markers.forEach(function(m) { p.removeMarker(m); });
    state.markers = [];
    state.infoWindows.forEach(function(iw) { p.closeInfoWindow(iw); });
    state.infoWindows = [];

    state.mapProvider = provider;
    localStorage.setItem('travelko_map_provider', provider);

    loadAndCreateMap(center, zoom);
  }

  function renderMapMarkers(spots) {
    if (!state.map || !state.mapLoaded) return;
    var p = mp();

    state.markers.forEach(function(m) { p.removeMarker(m); });
    state.markers = [];
    state.infoWindows.forEach(function(iw) { p.closeInfoWindow(iw); });
    state.infoWindows = [];

    var hasValidCoords = false;

    spots.forEach(function(spot) {
      if (!spot.lat || !spot.lng) return;
      hasValidCoords = true;

      var color = CAT_COLORS[spot.category] || '#666';
      var icon = CAT_ICONS[spot.category] || '📍';
      var marker = p.addMarker(state.map, spot.lat, spot.lng, color, icon);

      var thumbHtml = spot.coverImage
        ? '<img src="' + escapeAttr(spot.coverImage) + '" style="width:100%;height:100px;object-fit:cover;border-radius:8px 8px 0 0;">'
        : '';

      var infoWindow = p.createInfoWindow(
        '<div style="width:220px;background:white;border-radius:8px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.15);cursor:pointer;" class="ta-info-window" data-id="' + spot.id + '">' +
          thumbHtml +
          '<div style="padding:10px 12px;">' +
            '<div style="font-weight:600;font-size:0.9rem;color:#1F2937;">' + escapeHtml(spot.name) + '</div>' +
            '<div style="font-size:0.78rem;color:#9CA3AF;margin-top:4px;">' + escapeHtml(spot.region || '') + '</div>' +
          '</div>' +
        '</div>'
      );

      p.onMarkerClick(marker, function() {
        state.infoWindows.forEach(function(iw) { p.closeInfoWindow(iw); });
        p.openInfoWindow(infoWindow, state.map, marker);
        showDetail(spot);
      });

      marker._spotId = spot.id;
      state.markers.push(marker);
      state.infoWindows.push(infoWindow);
    });

    if (hasValidCoords && spots.length > 1) {
      p.fitBounds(state.map, spots);
    }
  }

  function highlightMarker(spot) {
    if (!state.map || !spot.lat || !spot.lng) return;
    var p = mp();

    state.infoWindows.forEach(function(iw) { p.closeInfoWindow(iw); });

    p.panTo(state.map, spot.lat, spot.lng);
    if (p.getZoom(state.map) < 13) {
      p.setZoom(state.map, 14);
    }

    for (var i = 0; i < state.markers.length; i++) {
      if (state.markers[i]._spotId === spot.id) {
        p.openInfoWindow(state.infoWindows[i], state.map, state.markers[i]);
        break;
      }
    }
  }

  // === Submit ===
  window.taShowSubmit = function() {
    document.getElementById('ta-submit-overlay').classList.add('active');
    document.body.style.overflow = 'hidden';
  };

  window.taCloseSubmit = function() {
    document.getElementById('ta-submit-overlay').classList.remove('active');
    document.body.style.overflow = '';
  };

  window.taSubmitSpot = function(event) {
    event.preventDefault();

    var name = document.getElementById('ta-sub-name').value.trim();
    var category = document.getElementById('ta-sub-category').value;
    var desc = document.getElementById('ta-sub-desc').value.trim();
    var address = document.getElementById('ta-sub-address').value.trim();
    var instagram = document.getElementById('ta-sub-instagram').value.trim();
    var author = document.getElementById('ta-sub-author').value.trim();

    if (!name || !desc || !author) return;

    var body = {
      name: name,
      category: category,
      description: desc,
      address: address,
      instagram: instagram,
      submittedBy: author,
      lang: state.lang
    };

    if (address) {
      mp().geocode(address, function(result) {
        if (result) {
          body.lat = result.lat;
          body.lng = result.lng;
        }
        submitToApi(body);
      });
    } else {
      submitToApi(body);
    }
  };

  function submitToApi(body) {
    fetch('/api/travel-submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (data.success) {
        alert(t('app.submitted'));
        taCloseSubmit();
        document.getElementById('ta-submit-form').reset();
      } else {
        alert(t('app.submitError'));
      }
    })
    .catch(function() {
      alert(t('app.submitError'));
    });
  }

  // === Planner ===
  window.taShowPlanner = function() {
    document.getElementById('ta-auth-profile').classList.remove('open');

    if (!state.authUser) {
      showToast(t('bookmark.loginRequired'));
      return;
    }

    var visitSpots = state.bookmarks
      .filter(function(b) { return b.type === 'want_to_visit'; })
      .map(function(b) { return state.spots.find(function(s) { return s.id === b.spotId; }); })
      .filter(Boolean);

    if (visitSpots.length === 0) {
      showToast(t('planner.noSpots'));
      return;
    }

    // Populate spots checklist
    var spotsEl = document.getElementById('ta-planner-spots');
    spotsEl.innerHTML = visitSpots.map(function(spot) {
      var icon = CAT_ICONS[spot.category] || '📍';
      return '<div class="ta-planner-spot-item">' +
        '<input type="checkbox" id="plan-spot-' + spot.id + '" value="' + spot.id + '" checked>' +
        '<label for="plan-spot-' + spot.id + '">' + icon + ' ' + escapeHtml(spot.name) + '</label>' +
      '</div>';
    }).join('');

    // Show form, hide result
    document.getElementById('ta-planner-form-view').style.display = '';
    document.getElementById('ta-planner-result-view').style.display = 'none';
    document.getElementById('ta-planner-loading-view').style.display = 'none';

    document.getElementById('ta-planner-overlay').classList.add('active');
    document.body.style.overflow = 'hidden';
  };

  window.taClosePlanner = function() {
    document.getElementById('ta-planner-overlay').classList.remove('active');
    document.body.style.overflow = '';
  };

  window.taPlannerBackToForm = function() {
    document.getElementById('ta-planner-form-view').style.display = '';
    document.getElementById('ta-planner-result-view').style.display = 'none';
    document.getElementById('ta-planner-loading-view').style.display = 'none';
  };

  window.taGeneratePlan = function() {
    // Gather selected spots
    var checkboxes = document.querySelectorAll('#ta-planner-spots input[type="checkbox"]:checked');
    var selectedIds = [];
    checkboxes.forEach(function(cb) { selectedIds.push(cb.value); });

    if (selectedIds.length === 0) {
      showToast(t('planner.noSpots'));
      return;
    }

    var selectedSpots = selectedIds.map(function(id) {
      return state.spots.find(function(s) { return s.id === id; });
    }).filter(Boolean);

    var days = parseInt(document.getElementById('ta-planner-days').value);
    var budgetBtn = document.querySelector('#ta-planner-budget .ta-option-btn.active');
    var styleBtn = document.querySelector('#ta-planner-style .ta-option-btn.active');

    var budget = budgetBtn ? budgetBtn.dataset.val : 'moderate';
    var style = styleBtn ? styleBtn.dataset.val : 'balanced';

    // Capture plan metadata for save feature
    _lastPlanData = {
      days: days,
      budget: budget,
      style: style,
      spotNames: selectedSpots.map(function(s) { return s.name; }),
      lang: state.lang
    };

    // Show loading
    document.getElementById('ta-planner-form-view').style.display = 'none';
    document.getElementById('ta-planner-result-view').style.display = 'none';
    document.getElementById('ta-planner-loading-view').style.display = '';

    // Call API
    fetch('/api/travel-planner', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        spots: selectedSpots.map(function(s) {
          return {
            name: s.name,
            category: s.category,
            region: s.region,
            address: s.address,
            description: s.description ? s.description.substring(0, 200) : ''
          };
        }),
        days: days,
        budget: budget,
        style: style,
        lang: state.lang
      })
    })
    .then(function(res) {
      if (!res.ok) {
        return res.text().then(function(text) {
          try { return JSON.parse(text); } catch(e) {
            return { error: 'Server error (' + res.status + ')' };
          }
        });
      }
      return res.json();
    })
    .then(function(data) {
      if (data.success && data.plan) {
        document.getElementById('ta-planner-result').innerHTML = renderMarkdown(data.plan);
        document.getElementById('ta-planner-loading-view').style.display = 'none';
        document.getElementById('ta-planner-result-view').style.display = '';
        if (typeof data.remaining === 'number') {
          showToast(t('planner.remaining').replace('{n}', data.remaining));
        }
      } else if (data.error === 'rate_limit') {
        showToast(t('planner.rateLimit').replace('{limit}', data.limit));
        taPlannerBackToForm();
      } else {
        var errMsg = data.detail || data.error || t('planner.error');
        console.error('Planner error:', errMsg);
        showToast(t('planner.error') + ' - ' + errMsg);
        taPlannerBackToForm();
      }
    })
    .catch(function(err) {
      console.error('Planner fetch error:', err);
      showToast(t('planner.error'));
      taPlannerBackToForm();
    });
  };

  // Simple markdown renderer for planner output
  function renderMarkdown(text) {
    return text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
      .replace(/\n{2,}/g, '</p><p>')
      .replace(/\n/g, '<br>');
  }

  // === Google Places Photos ===
  var _photoCache = {}; // cache by spot id

  function fetchPlacePhotos(spot, imagesEl, existingImages) {
    if (_photoCache[spot.id]) {
      renderPlacePhotos(imagesEl, existingImages, _photoCache[spot.id], spot.name);
      return;
    }

    fetch('/api/place-photos?name=' + encodeURIComponent(spot.name) +
      '&lat=' + spot.lat + '&lng=' + spot.lng)
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (data.photos && data.photos.length > 0) {
        _photoCache[spot.id] = data.photos;
        renderPlacePhotos(imagesEl, existingImages, data.photos, spot.name);
      } else if (existingImages.length === 0) {
        imagesEl.style.display = 'none';
        imagesEl.innerHTML = '';
      }
    })
    .catch(function() {
      if (existingImages.length === 0) {
        imagesEl.style.display = 'none';
        imagesEl.innerHTML = '';
      }
    });
  }

  function renderPlacePhotos(imagesEl, existingImages, googlePhotos, spotName) {
    // Existing images first, then Google photos (deduplicated)
    var existingHtml = existingImages.map(function(url) {
      return '<img src="' + escapeAttr(url) + '" alt="' + escapeAttr(spotName) + '">';
    }).join('');

    var googleHtml = googlePhotos.map(function(p) {
      return '<img src="' + escapeAttr(p.url) + '" alt="' + escapeAttr(spotName) + '" loading="lazy">';
    }).join('');

    imagesEl.innerHTML = existingHtml + googleHtml +
      '<div class="ta-detail-photos-attr">Photos by Google</div>';
    imagesEl.style.display = '';
  }

  // === Plan Save & Compare ===
  var _lastPlanData = null; // stores data from last generated plan

  // _lastPlanData is set inside taGeneratePlan before API call

  window.taSaveCurrentPlan = function() {
    var resultEl = document.getElementById('ta-planner-result');
    if (!resultEl || !resultEl.innerHTML || !_lastPlanData) {
      showToast('No plan to save');
      return;
    }

    // Ask user for a plan name
    var defaultName = t('planner.planTitle').replace('{days}', _lastPlanData.days);
    if (_lastPlanData.spotNames && _lastPlanData.spotNames.length > 0) {
      // Add first spot region hint
      defaultName += ' — ' + _lastPlanData.spotNames.slice(0, 2).join(', ');
    }
    var planName = prompt(t('planner.namePrompt'), defaultName);
    if (planName === null) return; // cancelled
    planName = planName.trim() || defaultName;

    var plan = {
      id: 'plan_' + Date.now(),
      createdAt: new Date().toISOString(),
      title: planName,
      days: _lastPlanData.days,
      budget: _lastPlanData.budget,
      style: _lastPlanData.style,
      spotNames: _lastPlanData.spotNames,
      planHtml: resultEl.innerHTML,
      lang: _lastPlanData.lang
    };

    var plans = getSavedPlans();
    plans.unshift(plan);
    if (plans.length > 30) plans = plans.slice(0, 30);
    localStorage.setItem('travelko_saved_plans', JSON.stringify(plans));

    showToast(t('planner.saved'));
    syncPlansToNotion(plans);
  };

  function getSavedPlans() {
    try {
      return JSON.parse(localStorage.getItem('travelko_saved_plans') || '[]');
    } catch(e) { return []; }
  }

  function syncPlansToNotion(plans) {
    if (!state.authUser) return;
    var meta = plans.map(function(p) {
      return { id: p.id, title: p.title, days: p.days, createdAt: p.createdAt.substring(0, 10) };
    });
    var metaStr = JSON.stringify(meta);
    if (metaStr.length > 1900) {
      meta = meta.slice(0, 10);
      metaStr = JSON.stringify(meta);
    }
    fetch('/api/user/bookmarks', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ action: 'sync_plans', plans: metaStr })
    }).catch(function() {});
  }

  window.taShowMyPlans = function() {
    document.getElementById('ta-auth-profile').classList.remove('open');
    var plans = getSavedPlans();
    var listEl = document.getElementById('ta-myplans-list');

    if (plans.length === 0) {
      listEl.innerHTML = '<div class="ta-myplans-empty">' + t('planner.noSavedPlans') + '</div>';
      document.getElementById('ta-compare-btn').style.display = 'none';
    } else {
      listEl.innerHTML = plans.map(function(plan) {
        var date = plan.createdAt ? plan.createdAt.substring(0, 10) : '';
        var spots = plan.spotNames ? plan.spotNames.slice(0, 3).join(', ') : '';
        if (plan.spotNames && plan.spotNames.length > 3) spots += '...';
        return '<div class="ta-myplans-card" data-plan-id="' + plan.id + '">' +
          '<input type="checkbox" class="ta-myplans-card-check" data-plan-id="' + plan.id + '" onclick="event.stopPropagation(); taUpdateCompareBtn()">' +
          '<div class="ta-myplans-card-info" onclick="taViewPlan(\'' + plan.id + '\')">' +
            '<div class="ta-myplans-card-title">' + escapeHtml(plan.title) + '</div>' +
            '<div class="ta-myplans-card-meta">' + date + ' · ' + (plan.budget || '') + ' · ' + spots + '</div>' +
          '</div>' +
          '<div class="ta-myplans-card-actions">' +
            '<button class="ta-btn-delete" onclick="event.stopPropagation(); taDeletePlan(\'' + plan.id + '\')">' + t('planner.deletePlan') + '</button>' +
          '</div>' +
        '</div>';
      }).join('');
      document.getElementById('ta-compare-btn').style.display = 'none';
    }

    document.getElementById('ta-myplans-list-view').style.display = '';
    document.getElementById('ta-myplans-detail-view').style.display = 'none';
    document.getElementById('ta-myplans-overlay').classList.add('active');
    document.body.style.overflow = 'hidden';
  };

  window.taCloseMyPlans = function() {
    document.getElementById('ta-myplans-overlay').classList.remove('active');
    document.body.style.overflow = '';
  };

  window.taViewPlan = function(planId) {
    var plans = getSavedPlans();
    var plan = plans.find(function(p) { return p.id === planId; });
    if (!plan) return;
    _currentViewPlanId = planId;
    document.getElementById('ta-share-panel-myplan').style.display = 'none';

    document.getElementById('ta-myplans-detail-title').textContent = plan.title;
    document.getElementById('ta-myplans-detail-meta').textContent =
      (plan.createdAt ? plan.createdAt.substring(0, 10) : '') + ' · ' +
      (plan.budget || '') + ' · ' + (plan.style || '') + ' · ' +
      t('planner.spots_count').replace('{n}', (plan.spotNames || []).length);
    document.getElementById('ta-myplans-detail-content').innerHTML = plan.planHtml || '';

    document.getElementById('ta-myplans-list-view').style.display = 'none';
    document.getElementById('ta-myplans-detail-view').style.display = '';
  };

  window.taMyPlansBack = function() {
    document.getElementById('ta-myplans-list-view').style.display = '';
    document.getElementById('ta-myplans-detail-view').style.display = 'none';
  };

  window.taDeletePlan = function(planId) {
    var plans = getSavedPlans().filter(function(p) { return p.id !== planId; });
    localStorage.setItem('travelko_saved_plans', JSON.stringify(plans));
    taShowMyPlans();
  };

  window.taUpdateCompareBtn = function() {
    var checked = document.querySelectorAll('.ta-myplans-card-check:checked');
    var btn = document.getElementById('ta-compare-btn');
    btn.style.display = checked.length >= 2 ? '' : 'none';
    btn.textContent = t('planner.compare') + ' (' + checked.length + ')';
  };

  window.taComparePlans = function() {
    var checked = document.querySelectorAll('.ta-myplans-card-check:checked');
    var plans = getSavedPlans();
    var selectedPlans = [];
    checked.forEach(function(cb) {
      var p = plans.find(function(plan) { return plan.id === cb.dataset.planId; });
      if (p) selectedPlans.push(p);
    });
    if (selectedPlans.length < 2) return;
    if (selectedPlans.length > 3) selectedPlans = selectedPlans.slice(0, 3);

    var contentEl = document.getElementById('ta-compare-content');
    // Mobile tabs
    var tabsHtml = '<div class="ta-compare-tabs">' +
      selectedPlans.map(function(p, i) {
        return '<button class="ta-compare-tab' + (i === 0 ? ' active' : '') + '" onclick="taCompareTab(' + i + ')">' + escapeHtml(p.title) + '</button>';
      }).join('') + '</div>';

    var colsHtml = selectedPlans.map(function(plan, i) {
      var date = plan.createdAt ? plan.createdAt.substring(0, 10) : '';
      return '<div class="ta-compare-col' + (i === 0 ? ' active' : '') + '" data-col="' + i + '">' +
        '<div class="ta-compare-col-header">' +
          '<h3>' + escapeHtml(plan.title) + '</h3>' +
          '<div class="meta">' + date + ' · ' + (plan.budget || '') + ' · ' + (plan.style || '') + '</div>' +
        '</div>' +
        '<div class="ta-compare-col-body">' + (plan.planHtml || '') + '</div>' +
      '</div>';
    }).join('');

    contentEl.innerHTML = tabsHtml + colsHtml;

    taCloseMyPlans();
    document.getElementById('ta-compare-overlay').classList.add('active');
    document.body.style.overflow = 'hidden';
  };

  window.taCompareTab = function(idx) {
    document.querySelectorAll('.ta-compare-tab').forEach(function(t, i) {
      t.classList.toggle('active', i === idx);
    });
    document.querySelectorAll('.ta-compare-col').forEach(function(c, i) {
      c.classList.toggle('active', i === idx);
    });
  };

  window.taCloseCompare = function() {
    document.getElementById('ta-compare-overlay').classList.remove('active');
    document.body.style.overflow = '';
  };

  // === Plan Sharing ===
  var _currentViewPlanId = null; // track which saved plan is being viewed

  function sharePlanData(planObj, panelId) {
    var panel = document.getElementById(panelId);
    panel.innerHTML = '<div class="ta-share-loading">' + t('planner.sharing') + '</div>';
    panel.style.display = '';

    fetch('/api/share-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: planObj.title || t('planner.planTitle').replace('{days}', planObj.days),
        days: planObj.days,
        budget: planObj.budget,
        style: planObj.style,
        spotNames: planObj.spotNames,
        planHtml: planObj.planHtml,
        lang: planObj.lang || state.lang
      })
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (data.success && data.shareUrl) {
        renderShareButtons(panel, data.shareUrl, planObj.title || 'My Korea Travel Plan');
      } else {
        panel.innerHTML = '<p class="ta-share-error">' + (data.error || 'Failed to create share link') + '</p>';
      }
    })
    .catch(function(err) {
      panel.innerHTML = '<p class="ta-share-error">Failed to create share link</p>';
    });
  }

  function renderShareButtons(panel, shareUrl, planTitle) {
    var text = encodeURIComponent(planTitle + ' — TravelKo');
    var url = encodeURIComponent(shareUrl);

    panel.innerHTML =
      '<div class="ta-share-header">' + t('planner.shareTitle') + '</div>' +
      '<div class="ta-share-url-row">' +
        '<input type="text" class="ta-share-url" value="' + escapeAttr(shareUrl) + '" readonly onclick="this.select()">' +
        '<button class="ta-share-copy" onclick="taCopyShareUrl(this)">' + t('planner.copyLink') + '</button>' +
      '</div>' +
      '<div class="ta-share-buttons">' +
        '<a href="https://wa.me/?text=' + text + '%20' + url + '" target="_blank" rel="noopener" class="ta-share-btn ta-share-whatsapp" title="WhatsApp">WhatsApp</a>' +
        '<a href="https://www.facebook.com/sharer/sharer.php?u=' + url + '" target="_blank" rel="noopener" class="ta-share-btn ta-share-facebook" title="Facebook">Facebook</a>' +
        '<a href="https://twitter.com/intent/tweet?text=' + text + '&url=' + url + '" target="_blank" rel="noopener" class="ta-share-btn ta-share-x" title="X (Twitter)">X</a>' +
        '<a href="https://t.me/share/url?url=' + url + '&text=' + text + '" target="_blank" rel="noopener" class="ta-share-btn ta-share-telegram" title="Telegram">Telegram</a>' +
      '</div>';
  }

  window.taCopyShareUrl = function(btn) {
    var input = btn.parentElement.querySelector('.ta-share-url');
    navigator.clipboard.writeText(input.value).then(function() {
      btn.textContent = '✓';
      setTimeout(function() { btn.textContent = t('planner.copyLink'); }, 2000);
    }).catch(function() {
      input.select();
      document.execCommand('copy');
      btn.textContent = '✓';
      setTimeout(function() { btn.textContent = t('planner.copyLink'); }, 2000);
    });
  };

  window.taSharePlan = function() {
    var resultEl = document.getElementById('ta-planner-result');
    if (!resultEl || !resultEl.innerHTML || !_lastPlanData) return;

    sharePlanData({
      title: _lastPlanData.spotNames ? t('planner.planTitle').replace('{days}', _lastPlanData.days) + ' — ' + _lastPlanData.spotNames.slice(0, 2).join(', ') : '',
      days: _lastPlanData.days,
      budget: _lastPlanData.budget,
      style: _lastPlanData.style,
      spotNames: _lastPlanData.spotNames,
      planHtml: resultEl.innerHTML,
      lang: _lastPlanData.lang
    }, 'ta-share-panel');
  };

  window.taShareSavedPlan = function() {
    if (!_currentViewPlanId) return;
    var plans = getSavedPlans();
    var plan = plans.find(function(p) { return p.id === _currentViewPlanId; });
    if (!plan) return;
    sharePlanData(plan, 'ta-share-panel-myplan');
  };

  // === Travel Tips ===
  // Language-aware URLs for official Korean travel/transport sites
  // Taxi review links — real traveler experiences per language
  var TAXI_REVIEWS = {
    en: [
      { title: 'Taxi Apps in Korea Explained (2025)', url: 'https://www.korealivingguide.com/2025/11/taxi-apps-in-korea-explained-which-app.html' },
      { title: 'How to Avoid Taxi Scams in Korea (2026)', url: 'https://www.love-korea.com/2026/01/how-to-avoid-taxi-scams-in-korea.html' },
      { title: 'Taxis in Korea 2025: Complete Guide', url: 'https://unniespicking.com/taxis-in-korea-2025-guide/' }
    ],
    ko: [
      { title: '외국인 필수 택시 어플 4가지 가이드', url: 'https://blog.myezl.com/%EC%99%B8%EA%B5%AD%EC%9D%B8-%ED%95%84%EC%88%98-%ED%83%9D%EC%8B%9C-%EC%96%B4%ED%94%8C-4%EA%B0%80%EC%A7%80-%ED%83%9D%EC%8B%9C-%EC%9D%B4%EC%9A%A9-%EA%B0%80%EC%9D%B4%EB%93%9C/' },
      { title: '한국 방문 외국인 택시 앱 가이드 (2025)', url: 'https://life.eduroadusa.com/2025/09/kakaot-ut-uber-2025.html' }
    ],
    id: [
      { title: 'Panduan Lengkap Taksi di Korea', url: 'https://www.haniseoul.com/id/travels/korea/korea-taxi-guide' },
      { title: 'Tips Berguna Naik Taksi di Korea', url: 'https://creatrip.com/id/blog/2487' }
    ],
    mn: [
      { title: 'Сөүл аяллын зөвлөх', url: 'https://www.airmarket.mn/page/163' },
      { title: 'Taxis in Korea Guide (English)', url: 'https://unniespicking.com/taxis-in-korea-2025-guide/' }
    ],
    ms: [
      { title: 'Melancong ke Korea dari Malaysia (2025)', url: 'https://wise.com/ms-my/blog/melancong-ke-korea-dari-malaysia' },
      { title: 'Panduan Jalan ke Korea Selatan (2025)', url: 'https://javamilk.com/panduan-jalan-ke-korea-selatan/' }
    ],
    vi: [
      { title: 'Kinh nghi\u1ec7m \u0111i taxi t\u1ea1i H\u00e0n Qu\u1ed1c (2025)', url: 'https://go-korea.com/kinh-nghiem-di-xe-taxi-tai-han-quoc/' },
      { title: 'C\u00e1ch d\u00f9ng Kakao Taxi kh\u00f4ng c\u1ea7n s\u1ed1 H\u00e0n', url: 'https://creatrip.com/vi/blog/13840' }
    ]
  };

  var TIPS_URLS = {
    visitKorea: {
      en: 'https://english.visitkorea.or.kr/',
      ko: 'https://korean.visitkorea.or.kr/',
      id: 'https://english.visitkorea.or.kr/',
      mn: 'https://english.visitkorea.or.kr/',
      ms: 'https://english.visitkorea.or.kr/',
      vi: 'https://english.visitkorea.or.kr/'
    },
    visitKoreaTransport: {
      en: 'https://english.visitkorea.or.kr/svc/planYourTravel/travelInfo/subTransportation.do',
      ko: 'https://korean.visitkorea.or.kr/svc/planYourTravel/travelInfo/subTransportation.do',
      id: 'https://english.visitkorea.or.kr/svc/planYourTravel/travelInfo/subTransportation.do',
      mn: 'https://english.visitkorea.or.kr/svc/planYourTravel/travelInfo/subTransportation.do',
      ms: 'https://english.visitkorea.or.kr/svc/planYourTravel/travelInfo/subTransportation.do',
      vi: 'https://english.visitkorea.or.kr/svc/planYourTravel/travelInfo/subTransportation.do'
    },
    korail: {
      en: 'https://www.korail.com/global/eng/ticket/reservation',
      ko: 'https://www.korail.com/global/kor/ticket/reservation',
      id: 'https://www.korail.com/global/id/ticket/reservation',
      mn: 'https://www.korail.com/global/eng/ticket/reservation',
      ms: 'https://www.korail.com/global/mas/ticket/reservation',
      vi: 'https://www.korail.com/global/vi/ticket/reservation'
    },
    kobus: {
      en: 'https://www.kobus.co.kr/web/eng/index.jsp',
      ko: 'https://www.kobus.co.kr/',
      id: 'https://www.kobus.co.kr/web/eng/index.jsp',
      mn: 'https://www.kobus.co.kr/web/eng/index.jsp',
      ms: 'https://www.kobus.co.kr/web/eng/index.jsp',
      vi: 'https://www.kobus.co.kr/web/eng/index.jsp'
    }
  };

  function tipsUrl(key) {
    return (TIPS_URLS[key] || {})[state.lang] || TIPS_URLS[key].en;
  }

  window.taShowTips = function() {
    var content = document.getElementById('ta-tips-content');
    content.innerHTML =
      '<p class="ta-tips-official">' + t('tips.officialInfo') + '</p>' +
      '<div class="ta-tips-section">' +
        '<h3>' + t('tips.transport') + '</h3>' +
        '<p class="ta-tips-desc">' + t('tips.transportDesc') + '</p>' +
        '<table class="ta-tips-table">' +
          '<tr><td>' + t('tips.subway') + '</td><td>' + t('tips.subwayInfo') + '</td></tr>' +
          '<tr><td>' + t('tips.bus') + '</td><td>' + t('tips.busInfo') + '</td></tr>' +
          '<tr><td>' + t('tips.taxi') + '</td><td>' + t('tips.taxiInfo') + '</td></tr>' +
          '<tr><td>' + t('tips.ktx') + '</td><td>' + t('tips.ktxInfo') + '</td></tr>' +
          '<tr><td>' + t('tips.airport') + '</td><td>' + t('tips.airportInfo') + '</td></tr>' +
        '</table>' +
        '<div class="ta-tips-links">' +
          '<a href="' + tipsUrl('korail') + '" target="_blank" rel="noopener" class="ta-tips-link">' +
            '🚄 ' + t('tips.bookKorail') + '</a>' +
          '<a href="' + tipsUrl('kobus') + '" target="_blank" rel="noopener" class="ta-tips-link">' +
            '🚌 ' + t('tips.bookBus') + '</a>' +
          '<a href="' + tipsUrl('visitKoreaTransport') + '" target="_blank" rel="noopener" class="ta-tips-link">' +
            '📋 ' + t('tips.moreTransport') + '</a>' +
        '</div>' +
      '</div>' +
      '<div class="ta-tips-section">' +
        '<h3>' + t('tips.meals') + '</h3>' +
        '<table class="ta-tips-table">' +
          '<tr><td>' + t('tips.budget') + '</td><td>' + t('tips.budgetDesc') + '</td></tr>' +
          '<tr><td>' + t('tips.moderate') + '</td><td>' + t('tips.moderateDesc') + '</td></tr>' +
          '<tr><td>' + t('tips.luxury') + '</td><td>' + t('tips.luxuryDesc') + '</td></tr>' +
        '</table>' +
      '</div>' +
      '<div class="ta-tips-section">' +
        '<h3>' + t('tips.useful') + '</h3>' +
        '<ul class="ta-tips-list">' +
          '<li>💳 ' + t('tips.tmoney') + '</li>' +
          '<li>🙅 ' + t('tips.tipping') + '</li>' +
          '<li>🏧 ' + t('tips.atm') + '</li>' +
          '<li>🚨 ' + t('tips.emergency') + '</li>' +
          '<li>📞 ' + t('tips.hotline') + '</li>' +
        '</ul>' +
        '<div class="ta-tips-links">' +
          '<a href="' + tipsUrl('visitKorea') + '" target="_blank" rel="noopener" class="ta-tips-link ta-tips-link-primary">' +
            '🇰🇷 ' + t('tips.visitKorea') + '</a>' +
        '</div>' +
      '</div>' +
      // Taxi Guide Section (summary + link to full guide page)
      '<div class="ta-tips-section ta-tips-taxi">' +
        '<h3>🚕 ' + t('tips.taxiGuide') + '</h3>' +
        '<p class="ta-tips-desc">' + t('tips.taxiIntro') + '</p>' +

        '<h4>' + t('tips.taxiApp') + '</h4>' +
        '<p class="ta-tips-desc">' + t('tips.taxiAppDesc') + '</p>' +
        '<div class="ta-tips-links">' +
          '<a href="https://play.google.com/store/apps/details?id=com.kakaomobility.kride" target="_blank" rel="noopener" class="ta-tips-link">' +
            '📱 ' + t('tips.taxiKride') + '</a>' +
          '<a href="https://english.seoul.go.kr/taba-taxi-app-for-international-tourists-in-seoul/" target="_blank" rel="noopener" class="ta-tips-link">' +
            '📱 ' + t('tips.taxiTaba') + '</a>' +
        '</div>' +

        '<h4>' + t('tips.taxiHail') + '</h4>' +
        '<p class="ta-tips-desc">' + t('tips.taxiHailDesc') + '</p>' +
        '<p class="ta-tips-desc" style="font-style:italic">' + t('tips.taxiDoor') + '</p>' +

        '<h4>' + t('tips.taxiTypes') + '</h4>' +
        '<ul class="ta-tips-list">' +
          '<li>🟠 ' + t('tips.taxiRegular') + '</li>' +
          '<li>⬛ ' + t('tips.taxiDeluxe') + '</li>' +
          '<li>🌐 ' + t('tips.taxiInternational') + '</li>' +
        '</ul>' +

        '<h4>' + t('tips.taxiPay') + '</h4>' +
        '<p class="ta-tips-desc">' + t('tips.taxiPayDesc') + '</p>' +

        '<h4>' + t('tips.taxiCost') + '</h4>' +
        '<table class="ta-tips-table">' +
          '<tr><td>✈️ Airport→Seoul</td><td>' + t('tips.taxiCostAirport') + '</td></tr>' +
          '<tr><td>🏙️ City ride</td><td>' + t('tips.taxiCostCity') + '</td></tr>' +
          '<tr><td>🌙 Night</td><td>' + t('tips.taxiCostNight') + '</td></tr>' +
        '</table>' +

        '<h4>⚠️ ' + t('tips.taxiSafety') + '</h4>' +
        '<ul class="ta-tips-list">' +
          '<li>' + t('tips.taxiSafety1') + '</li>' +
          '<li>' + t('tips.taxiSafety2') + '</li>' +
          '<li>' + t('tips.taxiSafety3') + '</li>' +
          '<li>' + t('tips.taxiSafety4') + '</li>' +
          '<li>' + t('tips.taxiSafety5') + '</li>' +
        '</ul>' +

        '<h4>📝 ' + t('tips.taxiReviews') + '</h4>' +
        '<div class="ta-tips-links">' +
          (TAXI_REVIEWS[state.lang] || TAXI_REVIEWS.en).map(function(r) {
            return '<a href="' + r.url + '" target="_blank" rel="noopener" class="ta-tips-link">' + r.title + '</a>';
          }).join('') +
        '</div>' +
        '<div class="ta-tips-links" style="margin-top:12px">' +
          '<a href="/guide/taxi?lang=' + state.lang + '" class="ta-tips-link ta-tips-link-primary">' +
            '📖 ' + t('tips.taxiGuide') + ' — Full Guide</a>' +
          '<a href="/guide/transport?lang=' + state.lang + '" class="ta-tips-link ta-tips-link-primary">' +
            '🚆 ' + t('tips.moreTransport') + ' — Full Guide</a>' +
        '</div>' +
      '</div>';

    document.getElementById('ta-tips-overlay').classList.add('active');
    document.body.style.overflow = 'hidden';
  };

  window.taCloseTips = function() {
    document.getElementById('ta-tips-overlay').classList.remove('active');
    document.body.style.overflow = '';
  };

  // === Filters ===
  function initFilters() {
    document.querySelectorAll('.ta-cat-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.ta-cat-btn').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        state.category = btn.dataset.cat;
        state.nextCursor = null;
        fetchSpots(false);
      });
    });

    document.getElementById('ta-region-select').addEventListener('change', function() {
      state.region = this.value;
      state.nextCursor = null;
      fetchSpots(false);
    });

    var searchInput = document.getElementById('ta-search');
    var searchTimer = null;
    searchInput.addEventListener('input', function() {
      clearTimeout(searchTimer);
      var val = this.value.trim();
      searchTimer = setTimeout(function() {
        state.search = val;
        var filtered = filterBySearch(state.spots);
        renderSpotList(filtered);
        renderMapMarkers(filtered);
      }, 300);
    });

    // Planner option buttons
    document.querySelectorAll('.ta-planner-options').forEach(function(group) {
      group.addEventListener('click', function(e) {
        var btn = e.target.closest('.ta-option-btn');
        if (!btn) return;
        group.querySelectorAll('.ta-option-btn').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
      });
    });

    // Days slider
    var daysSlider = document.getElementById('ta-planner-days');
    var daysVal = document.getElementById('ta-planner-days-val');
    if (daysSlider && daysVal) {
      daysSlider.addEventListener('input', function() {
        daysVal.textContent = this.value;
      });
    }
  }

  // === Submit modal overlay close ===
  function initModalClose() {
    document.getElementById('ta-submit-overlay').addEventListener('click', function(e) {
      if (e.target === e.currentTarget) taCloseSubmit();
    });

    document.getElementById('ta-planner-overlay').addEventListener('click', function(e) {
      if (e.target === e.currentTarget) taClosePlanner();
    });

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        taCloseSubmit();
        taClosePlanner();
        if (state.selectedSpot) taBackToList();
      }
    });
  }

  // === Toast ===
  function showToast(msg) {
    var existing = document.querySelector('.ta-toast');
    if (existing) existing.remove();

    var el = document.createElement('div');
    el.className = 'ta-toast';
    el.textContent = msg;
    document.body.appendChild(el);

    requestAnimationFrame(function() {
      el.classList.add('show');
    });

    setTimeout(function() {
      el.classList.remove('show');
      setTimeout(function() { el.remove(); }, 300);
    }, 2000);
  }

  // === Utility ===
  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function escapeAttr(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  window._taTriggerResize = function() {
    if (state.map && state.mapLoaded) {
      mp().triggerResize(state.map);
    }
  };

  // === Init ===
  function init() {
    initLanguage();
    applyTranslations();
    initFilters();
    initModalClose();
    initAuth();
    initMap();
    fetchSpots(false);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
