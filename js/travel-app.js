// TravelKo - travel.koinfo.kr Main Application
// Requires: sites/travel/lang.js (translations)

(function() {
  'use strict';

  // === State ===
  var state = {
    lang: localStorage.getItem('travelko_lang') || 'en',
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
    activeTab: 'explore'
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

  function initLanguage() {
    var select = document.getElementById('ta-lang-select');
    select.value = state.lang;
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
      }
    })
    .catch(function(err) {
      console.error('Auth error:', err);
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
      var spot = state.spots.find(function(s) { return s.id === bm.spotId; });
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
      imagesEl.style.display = 'none';
      imagesEl.innerHTML = '';
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
