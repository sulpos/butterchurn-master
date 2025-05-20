$(function() {
  var visualizer = null;
  var rendering = false;
  var audioContext = null;
  var sourceNode = null;
  var delayedAudible = null;
  var cycleInterval = null;
  var presets = {};
  var presetKeys = [];
  var presetIndexHist = [];
  var presetIndex = 0;
  var presetCycle = true;
  var presetCycleLength = 15000;
  var presetRandom = true;
  var canvas = document.getElementById('canvas');
  // Add layers management variables
  var layers = [];
  var overlayCanvas = null;

  // Sequence management
  var presetSequence = [];  // Now each item will be {name: string, duration: number}
  var sequenceInterval = null;
  var currentSequenceIndex = -1;
  var isPlaying = false;
  var progressAnimationFrame = null;
  var sequenceStartTime = null;

  function connectToAudioAnalyzer(sourceNode) {
    if(delayedAudible) {
      delayedAudible.disconnect();
    }

    delayedAudible = audioContext.createDelay();
    delayedAudible.delayTime.value = 0.26;

    sourceNode.connect(delayedAudible)
    delayedAudible.connect(audioContext.destination);

    visualizer.connectAudio(delayedAudible);
  }

  function startRenderer() {
    requestAnimationFrame(() => startRenderer());
    visualizer.render();
    if (layers.length > 0) {
      renderLayers();
    }
  }

  function playBufferSource(buffer) {
    if (!rendering) {
      rendering = true;
      startRenderer();
    }

    if (sourceNode) {
      sourceNode.disconnect();
    }

    sourceNode = audioContext.createBufferSource();
    sourceNode.buffer = buffer;
    connectToAudioAnalyzer(sourceNode);

    sourceNode.start(0);
  }

  async function loadLocalFiles(files, index = 0) {
    audioContext.resume();

    const file = files[index];
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    playBufferSource(audioBuffer);

    await new Promise(resolve => setTimeout(resolve, audioBuffer.duration * 1000));

    if (files.length > index + 1) {
      await loadLocalFiles(files, index + 1);
    } else {
      sourceNode.disconnect();
      sourceNode = null;
    }
  }

  function connectMicAudio(sourceNode, audioContext) {
    audioContext.resume();

    var gainNode = audioContext.createGain();
    gainNode.gain.value = 1.25;
    sourceNode.connect(gainNode);

    visualizer.connectAudio(gainNode);
    startRenderer();
  }

  function loadPreset(presetName, blendTime = 2.7) {
    visualizer.loadPreset(presets[presetName], blendTime);
  }

  function nextPreset(blendTime = 5.7) {
    presetIndexHist.push(presetIndex);

    var numPresets = presetKeys.length;
    if (presetRandom) {
      presetIndex = Math.floor(Math.random() * presetKeys.length);
    } else {
      presetIndex = (presetIndex + 1) % numPresets;
    }

    visualizer.loadPreset(presets[presetKeys[presetIndex]], blendTime);
    $('#presetSelect').val(presetIndex);
  }

  function prevPreset(blendTime = 5.7) {
    var numPresets = presetKeys.length;
    if (presetIndexHist.length > 0) {
      presetIndex = presetIndexHist.pop();
    } else {
      presetIndex = ((presetIndex - 1) + numPresets) % numPresets;
    }

    visualizer.loadPreset(presets[presetKeys[presetIndex]], blendTime);
    $('#presetSelect').val(presetIndex);
  }

  function restartCycleInterval() {
    if (cycleInterval) {
      clearInterval(cycleInterval);
      cycleInterval = null;
    }

    if (presetCycle) {
      cycleInterval = setInterval(() => nextPreset(2.7), presetCycleLength);
    }
  }

  // Layer management functions
  function createLayer(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
      const img = new Image();
      img.onload = function() {
        const layer = {
          image: img,
          opacity: 1.0,
          visible: true,
          name: file.name
        };
        layers.push(layer);
        updateLayersUI();
        renderLayers();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function updateLayersUI() {
    const layerControls = $('.layer-controls');
    // Keep the add layer button
    const addLayerButton = layerControls.find('#addLayer').detach();
    const fileInput = layerControls.find('#layerImageUpload').detach();
    
    layerControls.empty().append(fileInput, addLayerButton);

    layers.forEach((layer, index) => {
      const layerItem = $('<div>')
        .addClass('layer-item')
        .html(`
          <span class="layer-name">${layer.name}</span>
          <div class="layer-opacity">
            <label>Opacity:</label>
            <input type="range" min="0" max="100" value="${layer.opacity * 100}" class="opacity-slider">
            <span class="opacity-value">${Math.round(layer.opacity * 100)}%</span>
          </div>
          <button class="remove-layer">×</button>
        `);

      layerItem.find('.opacity-slider').on('input', function() {
        layer.opacity = this.value / 100;
        layerItem.find('.opacity-value').text(this.value + '%');
        renderLayers();
      });

      layerItem.find('.remove-layer').on('click', function() {
        layers.splice(index, 1);
        updateLayersUI();
        renderLayers();
      });

      layerControls.append(layerItem);
    });
  }

  function renderLayers() {
    if (!overlayCanvas) {
      overlayCanvas = document.createElement('canvas');
      overlayCanvas.style.position = 'absolute';
      overlayCanvas.style.top = '0';
      overlayCanvas.style.left = '0';
      overlayCanvas.style.width = '100%';
      overlayCanvas.style.height = '100%';
      overlayCanvas.style.pointerEvents = 'none';
      canvas.parentElement.appendChild(overlayCanvas);
    }

    // Match canvas dimensions
    overlayCanvas.width = canvas.width;
    overlayCanvas.height = canvas.height;

    const ctx = overlayCanvas.getContext('2d');
    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    layers.forEach(layer => {
      if (layer.visible) {
        ctx.globalAlpha = layer.opacity;
        // Draw image to fill the canvas while maintaining aspect ratio
        const imgRatio = layer.image.width / layer.image.height;
        const canvasRatio = overlayCanvas.width / overlayCanvas.height;
        let drawWidth, drawHeight, x, y;

        if (imgRatio > canvasRatio) {
          drawHeight = overlayCanvas.height;
          drawWidth = drawHeight * imgRatio;
          x = (overlayCanvas.width - drawWidth) / 2;
          y = 0;
        } else {
          drawWidth = overlayCanvas.width;
          drawHeight = drawWidth / imgRatio;
          x = 0;
          y = (overlayCanvas.height - drawHeight) / 2;
        }

        ctx.drawImage(layer.image, x, y, drawWidth, drawHeight);
      }
    });
  }

  function updateProgressBar() {
    if (!isPlaying || currentSequenceIndex === -1) return;
    
    const currentTime = Date.now();
    const elapsedTime = (currentTime - sequenceStartTime) / 1000;
    const duration = presetSequence[currentSequenceIndex].duration;
    const progress = Math.min((elapsedTime / duration) * 100, 100);
    
    const progressBar = $(`.preset-box:eq(${currentSequenceIndex}) .preset-progress`);
    progressBar.css('width', `${progress}%`);
    progressBar.toggleClass('complete', progress === 100);
    
    if (isPlaying) {
      progressAnimationFrame = requestAnimationFrame(updateProgressBar);
    }
  }

  function addCurrentPresetToSequence() {
    const currentPreset = presetKeys[presetIndex];
    presetSequence.push({
      name: currentPreset,
      duration: 60 // Default duration in seconds
    });
    updateTimelineUI();
  }

  function showDurationDialog(index) {
    const preset = presetSequence[index];
    const dialog = $('<div>')
      .addClass('duration-dialog')
      .css({
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        background: 'rgba(28, 28, 30, 0.95)',
        padding: '20px',
        borderRadius: '12px',
        zIndex: 2000,
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
      });

    const input = $('<input>')
      .attr('type', 'number')
      .attr('min', '1')
      .attr('step', '1')
      .val(preset.duration)
      .css({
        background: 'rgba(44, 44, 46, 0.8)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '8px',
        color: '#fff',
        padding: '8px',
        width: '100px',
        marginBottom: '10px'
      });

    const saveButton = $('<button>')
      .text('Save')
      .css({
        background: '#0A84FF',
        border: 'none',
        borderRadius: '8px',
        color: '#fff',
        padding: '8px 16px',
        marginLeft: '10px',
        cursor: 'pointer'
      });

    const cancelButton = $('<button>')
      .text('Cancel')
      .css({
        background: 'rgba(44, 44, 46, 0.8)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '8px',
        color: '#fff',
        padding: '8px 16px',
        cursor: 'pointer'
      });

    const buttonContainer = $('<div>')
      .css({
        display: 'flex',
        justifyContent: 'center',
        gap: '10px'
      })
      .append(cancelButton, saveButton);

    dialog.append(
      $('<div>').text('Duration (seconds)').css('marginBottom', '10px'),
      input,
      buttonContainer
    );

    saveButton.click(() => {
      const newDuration = parseInt(input.val());
      if (newDuration > 0) {
        preset.duration = newDuration;
        updateTimelineUI();
      }
      dialog.remove();
    });

    cancelButton.click(() => dialog.remove());

    $('body').append(dialog);
    input.focus();
  }

  function updateTimelineUI() {
    const timeline = $('#timeline');
    timeline.empty();
    
    presetSequence.forEach((preset, index) => {
      const box = $('<div>')
        .addClass('preset-box')
        .toggleClass('active', index === currentSequenceIndex);
      
      const nameSpan = $('<span>')
        .text(preset.name.substring(0, 20) + (preset.name.length > 20 ? '...' : ''));
      
      const durationButton = $('<button>')
        .addClass('duration-button')
        .text('T')
        .attr('title', `${preset.duration}s`)
        .on('click', (e) => {
          e.stopPropagation();
          showDurationDialog(index);
        });
      
      const removeBtn = $('<div>')
        .addClass('remove-preset')
        .html('×')
        .on('click', (e) => {
          e.stopPropagation();
          presetSequence.splice(index, 1);
          if (currentSequenceIndex >= index) {
            currentSequenceIndex--;
          }
          updateTimelineUI();
        });

      const progressBar = $('<div>')
        .addClass('preset-progress');

      const controls = $('<div>')
        .addClass('preset-controls')
        .append(durationButton, removeBtn);

      box.append(nameSpan, controls, progressBar);
      
      box.on('click', () => {
        currentSequenceIndex = index;
        loadPreset(preset.name);
        updateTimelineUI();
      });
      
      timeline.append(box);
    });
  }

  function playSequence() {
    if (presetSequence.length === 0) return;
    
    isPlaying = true;
    $('#playSequence').addClass('playing');
    
    if (currentSequenceIndex === -1) {
      currentSequenceIndex = 0;
    }
    
    const currentPreset = presetSequence[currentSequenceIndex];
    loadPreset(currentPreset.name);
    updateTimelineUI();
    
    sequenceStartTime = Date.now();
    updateProgressBar();
    
    sequenceInterval = setInterval(() => {
      currentSequenceIndex = (currentSequenceIndex + 1) % presetSequence.length;
      const nextPreset = presetSequence[currentSequenceIndex];
      loadPreset(nextPreset.name);
      updateTimelineUI();
      sequenceStartTime = Date.now();
    }, presetSequence[currentSequenceIndex].duration * 1000);
  }

  function pauseSequence() {
    isPlaying = false;
    $('#playSequence').removeClass('playing');
    if (sequenceInterval) {
      clearInterval(sequenceInterval);
      sequenceInterval = null;
    }
    if (progressAnimationFrame) {
      cancelAnimationFrame(progressAnimationFrame);
      progressAnimationFrame = null;
    }
    // Reset all progress bars
    $('.preset-progress').css('width', '0%').removeClass('complete');
  }

  function toggleSequencePlayback() {
    if (isPlaying) {
      pauseSequence();
    } else {
      playSequence();
    }
  }

  function saveSequence() {
    const data = JSON.stringify(presetSequence);
    const blob = new Blob([data], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'preset-sequence.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function loadSequence() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          presetSequence = JSON.parse(event.target.result);
          // Ensure all presets have a duration
          presetSequence = presetSequence.map(preset => {
            if (typeof preset === 'string') {
              // Convert old format to new format
              return { name: preset, duration: 60 };
            } else if (!preset.duration) {
              // Ensure duration exists
              preset.duration = 60;
            }
            return preset;
          });
          currentSequenceIndex = -1;
          updateTimelineUI();
        } catch (err) {
          console.error('Error loading sequence:', err);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  // Event Handlers
  $(document).keydown((e) => {
    if (e.which === 32 || e.which === 39) {
      nextPreset();
    } else if (e.which === 8 || e.which === 37) {
      prevPreset();
    } else if (e.which === 72) {
      nextPreset(0);
    }
  });

  $('#presetSelect').change((evt) => {
    presetIndexHist.push(presetIndex);
    presetIndex = parseInt($('#presetSelect').val());
    visualizer.loadPreset(presets[presetKeys[presetIndex]], 5.7);
  });

  $('#presetCycle').change(() => {
    presetCycle = $('#presetCycle').is(':checked');
    restartCycleInterval();
  });

  $('#presetCycleLength').change((evt) => {
    presetCycleLength = parseInt($('#presetCycleLength').val() * 1000);
    restartCycleInterval();
  });

  $('#presetRandom').change(() => {
    presetRandom = $('#presetRandom').is(':checked');
  });

  // Layer controls event handlers
  $("#layersButton").click(function() {
    $('#layersMenu').toggleClass('hidden');
  });

  $("#addLayer").click(function() {
    $('#layerImageUpload').click();
  });

  $("#layerImageUpload").change(function(e) {
    if (this.files && this.files[0]) {
      createLayer(this.files[0]);
    }
  });

  $(".hide-layers").click(function() {
    $('#layersMenu').addClass('hidden');
  });

  // Add keyboard shortcuts toggle
  $('.hide-shortcuts').click(function() {
    $('#keyboardShortcuts').addClass('hidden');
  });

  $("#localFileBut").click(function() {
    var fileSelector = $('<input type="file" accept="audio/*" multiple />');

    fileSelector[0].onchange = function(event) {
      loadLocalFiles(fileSelector[0].files);
    }

    fileSelector.click();
  });

  $("#micSelect").click(() => {
    navigator.getUserMedia({ audio: true }, (stream) => {
      var micSourceNode = audioContext.createMediaStreamSource(stream);
      connectMicAudio(micSourceNode, audioContext);
    }, (err) => {
      console.log('Error getting audio stream from getUserMedia');
    });
  });

  function initPlayer() {
    audioContext = new AudioContext();

    presets = {};
    if (window.butterchurnPresets) {
      Object.assign(presets, butterchurnPresets.getPresets());
    }
    if (window.butterchurnPresetsExtra) {
      Object.assign(presets, butterchurnPresetsExtra.getPresets());
    }
    presets = _(presets).toPairs().sortBy(([k, v]) => k.toLowerCase()).fromPairs().value();
    presetKeys = _.keys(presets);
    presetIndex = Math.floor(Math.random() * presetKeys.length);

    var presetSelect = document.getElementById('presetSelect');
    for(var i = 0; i < presetKeys.length; i++) {
        var opt = document.createElement('option');
        opt.innerHTML = presetKeys[i].substring(0,60) + (presetKeys[i].length > 60 ? '...' : '');
        opt.value = i;
        presetSelect.appendChild(opt);
    }

    // Set canvas size to window dimensions
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    visualizer = butterchurn.default.createVisualizer(audioContext, canvas, {
      width: window.innerWidth,
      height: window.innerHeight,
      pixelRatio: window.devicePixelRatio || 1,
      textureRatio: 1,
    });

    // Handle window resize for both canvases
    window.addEventListener('resize', () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      visualizer.setRendererSize(window.innerWidth, window.innerHeight);
      if (overlayCanvas) {
        renderLayers();
      }
    });

    nextPreset(0);
    cycleInterval = setInterval(() => nextPreset(2.7), presetCycleLength);

    // Add click handlers for sequence controls
    $('#addPreset').click(addCurrentPresetToSequence);
    $('#saveSequence').click(saveSequence);
    $('#loadSequence').click(loadSequence);
    $('#playSequence').click(toggleSequencePlayback);

    // Clean up on page unload
    $(window).on('unload', () => {
      if (sequenceInterval) {
        clearInterval(sequenceInterval);
      }
      if (progressAnimationFrame) {
        cancelAnimationFrame(progressAnimationFrame);
      }
    });
  }

  initPlayer();
});
