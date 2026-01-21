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
const fileTree = document.getElementById('file-tree');

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
    if (currentFile.type.startsWith('image/')) {
      setStatus('Compressing...');
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Failed to read file.'));
        reader.readAsDataURL(currentFile);
      });

      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: currentFile.name,
          contentType: currentFile.type,
          folder: folderInput.value.trim(),
          imageBase64: dataUrl,
          targetBytes: 500000
        })
      });

      if (!response.ok) {
        throw new Error('Compression upload failed.');
      }

      const data = await response.json();
      currentCdnUrl = data.cdnUrl;
      cdnUrlEl.textContent = data.cdnUrl;
      cdnUrlEl.href = data.cdnUrl;
      meta.textContent = `${currentFile.name} • ${(data.bytes / (1024 * 1024)).toFixed(2)} MB (compressed)`;
      result.classList.add('visible');
      copyBtn.disabled = false;
      setStatus('Complete');
    } else {
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
    }
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

function clearTree() {
  fileTree.innerHTML = '';
}

function insertPath(tree, parts, item) {
  let node = tree;
  parts.forEach((part, idx) => {
    node.children = node.children || {};
    node.children[part] = node.children[part] || {};
    node = node.children[part];
    if (idx === parts.length - 1) {
      node.item = item;
    }
  });
}

function buildTree(items, type) {
  const root = {};
  items.forEach((item) => {
    const trimmed = item.key.replace(new RegExp(`^soulscape/${type}/`), '');
    const parts = trimmed.split('/').filter(Boolean);
    insertPath(root, parts, item);
  });
  return root.children || {};
}

function renderTreeNode(name, node, pathParts, type) {
  const li = document.createElement('li');
  const currentPath = [...pathParts, name];

  if (node.item && !node.children) {
    const link = document.createElement('a');
    link.className = 'file-link';
    link.href = node.item.cdnUrl;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = name;
    li.appendChild(link);
  } else {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'folder';
    button.textContent = `📁 ${name}`;
    button.addEventListener('click', () => {
      const folderPath = currentPath.join('/');
      folderInput.value = folderPath;
      setStatus(`Folder set: ${folderPath}`);
    });
    li.appendChild(button);

    const ul = document.createElement('ul');
    const entries = Object.entries(node.children || {}).sort(([a], [b]) => a.localeCompare(b));
    entries.forEach(([childName, childNode]) => {
      ul.appendChild(renderTreeNode(childName, childNode, currentPath, type));
    });
    li.appendChild(ul);
  }

  return li;
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
  clearTree();
  try {
    const [images, videos] = await Promise.all([fetchList('image'), fetchList('video')]);
    const imageTree = buildTree(images.items, 'image');
    const videoTree = buildTree(videos.items, 'video');

    const wrapper = document.createElement('ul');
    const imageRoot = document.createElement('li');
    imageRoot.innerHTML = '<span class=\"folder\">🖼 Images</span>';
    const imageList = document.createElement('ul');
    Object.entries(imageTree).forEach(([name, node]) => {
      imageList.appendChild(renderTreeNode(name, node, [], 'image'));
    });
    imageRoot.appendChild(imageList);
    wrapper.appendChild(imageRoot);

    const videoRoot = document.createElement('li');
    videoRoot.innerHTML = '<span class=\"folder\">🎬 Videos</span>';
    const videoList = document.createElement('ul');
    Object.entries(videoTree).forEach(([name, node]) => {
      videoList.appendChild(renderTreeNode(name, node, [], 'video'));
    });
    videoRoot.appendChild(videoList);
    wrapper.appendChild(videoRoot);

    fileTree.appendChild(wrapper);
    setListStatus('Loaded');
  } catch (err) {
    setListStatus('Error');
  }
}

refreshBtn.addEventListener('click', refreshList);
refreshList();
