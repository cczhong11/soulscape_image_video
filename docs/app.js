const API_ENDPOINT = 'https://oiuw4wyhzb.execute-api.us-east-1.amazonaws.com/upload';
const LIST_ENDPOINT = 'https://oiuw4wyhzb.execute-api.us-east-1.amazonaws.com/list';

const fileInput = document.getElementById('file');
const drop = document.getElementById('drop');
const uploadBtn = document.getElementById('upload');
const copyBtn = document.getElementById('copy');
const statusEl = document.getElementById('status');
const preview = document.getElementById('preview');
const result = document.getElementById('result');
const cdnUrlEl = document.getElementById('cdnUrl');
const meta = document.getElementById('meta');
const folderInput = document.getElementById('folder');
const listStatusEl = document.getElementById('list-status');
const refreshBtn = document.getElementById('refresh-list');
const imageGallery = document.getElementById('image-gallery');
const videoGallery = document.getElementById('video-gallery');

let currentFile = null;
let currentCdnUrl = '';

function setStatus(text) {
  statusEl.textContent = text;
}

function resetResult() {
  result.classList.remove('visible');
  cdnUrlEl.textContent = '';
  cdnUrlEl.href = '#';
  meta.textContent = '';
  copyBtn.disabled = true;
  currentCdnUrl = '';
}

function renderPreview(file) {
  preview.innerHTML = '';

  if (!file) {
    preview.textContent = 'No file selected yet.';
    return;
  }

  if (file.type.startsWith('image/')) {
    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    img.onload = () => URL.revokeObjectURL(img.src);
    preview.appendChild(img);
  } else if (file.type.startsWith('video/')) {
    const video = document.createElement('video');
    video.src = URL.createObjectURL(file);
    video.controls = true;
    video.onloadeddata = () => URL.revokeObjectURL(video.src);
    preview.appendChild(video);
  } else {
    preview.textContent = 'Unsupported file type.';
  }
}

function setFile(file) {
  currentFile = file;
  uploadBtn.disabled = !file;
  resetResult();
  renderPreview(file);
  setStatus(file ? 'Ready' : 'Idle');
}

fileInput.addEventListener('change', (event) => {
  const file = event.target.files[0];
  setFile(file);
});

['dragenter', 'dragover'].forEach((eventName) => {
  drop.addEventListener(eventName, (event) => {
    event.preventDefault();
    drop.classList.add('dragover');
  });
});

['dragleave', 'drop'].forEach((eventName) => {
  drop.addEventListener(eventName, (event) => {
    event.preventDefault();
    drop.classList.remove('dragover');
  });
});

drop.addEventListener('drop', (event) => {
  const file = event.dataTransfer.files[0];
  if (file) {
    fileInput.files = event.dataTransfer.files;
    setFile(file);
  }
});

uploadBtn.addEventListener('click', async () => {
  if (!currentFile) return;

  setStatus('Requesting upload URL...');
  uploadBtn.disabled = true;

  try {
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: currentFile.name,
        contentType: currentFile.type,
        folder: folderInput.value.trim()
      })
    });

    if (!response.ok) {
      throw new Error('Failed to get upload URL.');
    }

    const data = await response.json();
    setStatus('Uploading...');

    const putResponse = await fetch(data.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': currentFile.type },
      body: currentFile
    });

    if (!putResponse.ok) {
      throw new Error('Upload failed.');
    }

    currentCdnUrl = data.cdnUrl;
    cdnUrlEl.textContent = data.cdnUrl;
    cdnUrlEl.href = data.cdnUrl;
    meta.textContent = `${currentFile.name} • ${(currentFile.size / (1024 * 1024)).toFixed(2)} MB`;
    result.classList.add('visible');
    copyBtn.disabled = false;
    setStatus('Complete');
  } catch (err) {
    setStatus('Error');
    alert(err.message);
  } finally {
    uploadBtn.disabled = !currentFile;
  }
});

copyBtn.addEventListener('click', async () => {
  if (!currentCdnUrl) return;
  await navigator.clipboard.writeText(currentCdnUrl);
  setStatus('Copied');
});

setFile(null);

function setListStatus(text) {
  listStatusEl.textContent = text;
}

function clearGallery() {
  imageGallery.innerHTML = '';
  videoGallery.innerHTML = '';
}

function createItem(url, key, isVideo) {
  const card = document.createElement('div');
  card.className = 'gallery-item';

  if (isVideo) {
    const video = document.createElement('video');
    video.src = url;
    video.controls = true;
    card.appendChild(video);
  } else {
    const img = document.createElement('img');
    img.src = url;
    img.alt = key;
    card.appendChild(img);
  }

  const meta = document.createElement('div');
  meta.className = 'gallery-meta';
  meta.textContent = key.replace(/^soulscape\/(image|video)\//, '');
  card.appendChild(meta);
  return card;
}

async function fetchList(type) {
  const response = await fetch(`${LIST_ENDPOINT}?type=${encodeURIComponent(type)}`);
  if (!response.ok) {
    throw new Error('Failed to load list.');
  }
  return response.json();
}

async function refreshList() {
  setListStatus('Loading...');
  clearGallery();
  try {
    const [images, videos] = await Promise.all([fetchList('image'), fetchList('video')]);
    images.items.forEach((item) => {
      imageGallery.appendChild(createItem(item.cdnUrl, item.key, false));
    });
    videos.items.forEach((item) => {
      videoGallery.appendChild(createItem(item.cdnUrl, item.key, true));
    });
    setListStatus('Loaded');
  } catch (err) {
    setListStatus('Error');
  }
}

refreshBtn.addEventListener('click', refreshList);
refreshList();
