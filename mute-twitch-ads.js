/// mute-twitch-ads.js
(function () {
  // const log = console.log.bind(console);
  const log = () => {};

  log('mute-twitch-ads', this);

  if (window.location.href === 'about:blank') {
    return;
  }

  const AD_BREAK_SELECTOR =
    '[aria-label="ad" i],' +
    [
      'ad',
      'annonce',
      'werbung',
      'anuncio',
      'annuncio',
      'hirdetésről',
      'reclame',
      'annonsen',
      'reklamy',
      'anúncio',
      'reclamă',
      'reklame',
      'mainoksesta',
      'quảng',
      'reklam',
      'διαφήμιση',
      'реклама',
      'рекламы',
      'оголошення',
      '광고에',
    ]
      .map(
        (w) =>
          `button[aria-label$=" ${w}" i],button[aria-label*=" ${w} " i]`
      )
      .join(',') +
    ',' +
    [
      'โฆษณา',
      '对此广告留下反馈',
      '留下你對此廣告的意見反應',
      'この広告のフィードバックを残す',
    ]
      .map((w) => `button[aria-label*="${w}" i]`)
      .join(',');

  let observedVideo = undefined;
  let observedContainer = undefined;
  let wasAdBreak = false;

  let savedVolume = {
    volume: 0,
    muted: true,
  };

  // miniVideo拡大用
  let enlargedMiniVideo = undefined;
  let savedMiniStyle = undefined;

  // resize追従用
  let resizeObserver = undefined;

  const observer = new MutationObserver(() => {
    if (!observedVideo || !observedContainer) {
      return;
    }

    const isAdBreak = !!observedContainer.querySelector(
      AD_BREAK_SELECTOR
    );

    if (isAdBreak === wasAdBreak) {
      return;
    }

    log(isAdBreak ? 'ad started' : 'ad ended');

    wasAdBreak = isAdBreak;

    if (isAdBreak) {
      //
      // 広告開始
      //

      copyVolume(observedVideo, savedVolume);

      // 広告映像を隠す
      observedVideo.style.opacity = '0';

      if (!observedVideo.muted) {
        log('muting ad');
        observedVideo.muted = true;
      }

      const startTime = performance.now();

      const setupMiniVideo = () => {
        log('finding mini video');

        const miniVideo = findMiniVideo(observedVideo);

        if (!miniVideo || !isPlaying(miniVideo)) {
          if (
            wasAdBreak &&
            performance.now() - startTime < 10000
          ) {
            setTimeout(setupMiniVideo, 200);
          }

          return;
        }

        log('found mini video', miniVideo);

        // Twitch側のminiVideoの音声を
        // 元々のメインVideoの音量に合わせる
        copyVolume(savedVolume, miniVideo);

        // native controlsは不要ならfalseでもOK
        miniVideo.controls = false;

        // miniVideoをメイン領域へ拡大
        showMiniAsMain(miniVideo, observedVideo);
      };

      setTimeout(setupMiniVideo, 200);
    } else {
      //
      // 広告終了
      //

      restoreMiniVideo();

      observedVideo.style.removeProperty('opacity');

      const miniVideo = findMiniVideo(observedVideo);

      log('restoring main video volume');

      if (miniVideo) {
        log('muting mini video');

        // mini側の現在音量をメインへ戻す
        copyVolume(miniVideo, observedVideo);

        miniVideo.muted = true;
      } else {
        copyVolume(savedVolume, observedVideo);
      }
    }
  });

  function findVideo() {
    log('finding video');

    const video =
      document.body &&
      document.body.querySelector(
        'video[src^="blob:https://www.twitch.tv/"],' +
          'video[src^="blob:https://m.twitch.tv/"]'
      );

    if (!video) {
      setTimeout(findVideo, 1000);
      return;
    }

    const container = getVideoContainer(video);

    log('found main video', video, container);

    observedVideo = video;
    observedContainer = container;

    observer.observe(container, {
      attributes: false,
      characterData: true,
      childList: true,
      subtree: true,
    });
  }

  function findMiniVideo(video) {
    const doc = video?.ownerDocument;

    if (!doc?.body) {
      return undefined;
    }

    const candidates = [...doc.body.querySelectorAll('video')]
      .filter((candidate) => {
        if (candidate === video) {
          return false;
        }

        if (!candidate.currentSrc) {
          return false;
        }

        if (!isPlaying(candidate)) {
          return false;
        }

        return true;
      });

    if (!candidates.length) {
      return undefined;
    }

    // 一応、表示領域が大きいVideoを優先
    candidates.sort((a, b) => {
      const aRect = a.getBoundingClientRect();
      const bRect = b.getBoundingClientRect();

      const aArea = aRect.width * aRect.height;
      const bArea = bRect.width * bRect.height;

      return bArea - aArea;
    });

    return candidates[0];
  }

  function showMiniAsMain(miniVideo, mainVideo) {
    if (!miniVideo || !mainVideo) {
      return;
    }

    if (enlargedMiniVideo === miniVideo) {
      updateMiniPosition();
      return;
    }

    // すでに別のminiVideoを拡大していた場合
    restoreMiniVideo();

    enlargedMiniVideo = miniVideo;

    // 元のstyleを丸ごと保存
    savedMiniStyle = miniVideo.getAttribute('style');

    Object.assign(miniVideo.style, {
      position: 'fixed',

      margin: '0',
      padding: '0',

      maxWidth: 'none',
      maxHeight: 'none',

      objectFit: 'contain',

      background: 'black',

      opacity: '1',
      visibility: 'visible',

      pointerEvents: 'none',

      // ほぼ最前面
      zIndex: '2147483646',

      transform: 'none',
    });

    updateMiniPosition();

    //
    // Twitchプレイヤーのサイズ変更に追従
    //
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        updateMiniPosition();
      });

      resizeObserver.observe(mainVideo);
    }

    window.addEventListener('resize', updateMiniPosition);

    // スクロール・シアターモード切替などでも
    // 座標が変わる可能性がある
    window.addEventListener('scroll', updateMiniPosition, true);
  }

  function updateMiniPosition() {
    if (!enlargedMiniVideo || !observedVideo) {
      return;
    }

    const rect = observedVideo.getBoundingClientRect();

    Object.assign(enlargedMiniVideo.style, {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
  }

  function restoreMiniVideo() {
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = undefined;
    }

    window.removeEventListener('resize', updateMiniPosition);
    window.removeEventListener(
      'scroll',
      updateMiniPosition,
      true
    );

    if (!enlargedMiniVideo) {
      return;
    }

    log('restoring mini video');

    try {
      if (savedMiniStyle === null) {
        enlargedMiniVideo.removeAttribute('style');
      } else {
        enlargedMiniVideo.setAttribute(
          'style',
          savedMiniStyle
        );
      }

      enlargedMiniVideo.controls = false;
    } catch (e) {
      log('failed to restore mini video', e);
    }

    enlargedMiniVideo = undefined;
    savedMiniStyle = undefined;
  }

  function videoRemoved() {
    log('video removed');

    restoreMiniVideo();

    observer.disconnect();

    observedVideo = undefined;
    observedContainer = undefined;
    wasAdBreak = false;

    findVideo();
  }

  function isPlaying(video) {
    return !!(
      video.currentSrc &&
      video.currentTime > 0 &&
      !video.paused &&
      !video.ended
    );
  }

  function copyVolume(from, to) {
    to.volume = from.volume;
    to.muted = from.muted;
  }

  function getVideoContainer(video) {
    let container = video;
    const videoRect = video.getBoundingClientRect();

    while (
      container.parentElement &&
      rectDiff(
        videoRect,
        container.parentElement.getBoundingClientRect()
      ) <= 8
    ) {
      container = container.parentElement;
    }

    return container;
  }

  function rectDiff(rect1, rect2) {
    return (
      Math.abs(rect1.x - rect2.x) +
      Math.abs(rect1.y - rect2.y) +
      Math.abs(rect1.width - rect2.width) +
      Math.abs(rect1.height - rect2.height)
    );
  }

  findVideo();

  setInterval(() => {
    if (
      observedVideo &&
      document.body &&
      !document.body.contains(observedVideo)
    ) {
      videoRemoved();
    }
  }, 500);
})();
