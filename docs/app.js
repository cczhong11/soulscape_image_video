const API_ENDPOINT = 'https://oiuw4wyhzb.execute-api.us-east-1.amazonaws.com/upload';
const LIST_ENDPOINT = 'https://oiuw4wyhzb.execute-api.us-east-1.amazonaws.com/list';

const fileInput = document.getElementById('file');
const drop = document.getElementById('drop');
const uploadBtn = document.getElementById('upload');
const copyBtn = document.getElementById('copy');
const statusEl = document.getElementById('status');
const preview = document.getElementById('preview');
const result = document.getElementById('result');
const resultList = document.getElementById('result-list');
const folderInput = document.getElementById('folder');
const listStatusEl = document.getElementById('list-status');
const refreshBtn = document.getElementById('refresh-list');
const fileTree = document.getElementById('file-tree');

let currentFiles = [];
let currentCdnUrls = [];

function setStatus(text) {
  statusEl.textContent = text;
}

function resetResult() {
  result.classList.remove('visible');
  resultList.innerHTML = '';
  copyBtn.disabled = true;
  currentCdnUrls = [];
}

function renderPreview(files) {
  preview.innerHTML = '';

  if (!files.length) {
    preview.textContent = 'No files selected yet.';
    return;
  }

  if (files.length === 1 && files[0].type.startsWith('image/')) {
    const img = document.createElement('img');
    img.src = URL.createObjectURL(files[0]);
    img.onload = () => URL.revokeObjectURL(img.src);
    preview.appendChild(img);
    return;
  }

  if (files.length === 1 && files[0].type.startsWith('video/')) {
    const video = document.createElement('video');
    video.src = URL.createObjectURL(files[0]);
    video.controls = true;
    video.onloadeddata = () => URL.revokeObjectURL(video.src);
    preview.appendChild(video);
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'preview-grid';
  files.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'preview-card';

    if (item.type.startsWith('image/')) {
      const img = document.createElement('img');
      img.src = URL.createObjectURL(item);
      img.onload = () => URL.revokeObjectURL(img.src);
      card.appendChild(img);
    } else {
      const icon = document.createElement('div');
      icon.className = 'preview-icon';
      icon.textContent = '▶';
      card.appendChild(icon);
    }

    const info = document.createElement('div');
    info.className = 'preview-info';
    info.textContent = item.name;
    card.appendChild(info);

    grid.appendChild(card);
  });
  preview.appendChild(grid);
}

function setFiles(files) {
  currentFiles = files;
  uploadBtn.disabled = files.length === 0;
  resetResult();
  renderPreview(files);
  setStatus(files.length ? `Ready (${files.length} selected)` : 'Idle');
}

fileInput.addEventListener('change', (event) => {
  const selected = Array.from(event.target.files || []).filter((file) =>
    file.type.startsWith('image/') || file.type.startsWith('video/')
  );
  setFiles(selected);
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
  const selected = Array.from(event.dataTransfer.files || []).filter((file) =>
    file.type.startsWith('image/') || file.type.startsWith('video/')
  );
  if (selected.length) {
    setFiles(selected);
  }
});

uploadBtn.addEventListener('click', async () => {
  if (!currentFiles.length) return;

  setStatus('Starting uploads...');
  uploadBtn.disabled = true;

  try {
    const folder = folderInput.value.trim();
    const uploads = [];

    for (let index = 0; index < currentFiles.length; index += 1) {
      const file = currentFiles[index];
      const label = `Uploading ${index + 1} of ${currentFiles.length}`;

      if (file.type.startsWith('image/')) {
        setStatus(`Compressing ${index + 1} of ${currentFiles.length}`);
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('Failed to read file.'));
          reader.readAsDataURL(file);
        });

        const response = await fetch(API_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: file.name,
            contentType: file.type,
            folder,
            imageBase64: dataUrl,
            targetBytes: 500000
          })
        });

        if (!response.ok) {
          throw new Error('Compression upload failed.');
        }

        const data = await response.json();
        uploads.push({
          fileName: file.name,
          cdnUrl: data.cdnUrl,
          bytes: data.bytes,
          compressed: true
        });
        setStatus(label);
      } else {
        const response = await fetch(API_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: file.name,
            contentType: file.type,
            folder
          })
        });

        if (!response.ok) {
          throw new Error('Failed to get upload URL.');
        }

        const data = await response.json();
        setStatus(label);

        const putResponse = await fetch(data.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type },
          body: file
        });

        if (!putResponse.ok) {
          throw new Error('Upload failed.');
        }

        uploads.push({
          fileName: file.name,
          cdnUrl: data.cdnUrl,
          bytes: file.size,
          compressed: false
        });
      }
    }

    currentCdnUrls = uploads.map((item) => item.cdnUrl);
    resultList.innerHTML = '';
    uploads.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'result-item';

      const link = document.createElement('a');
      link.href = item.cdnUrl;
      link.target = '_blank';
      link.rel = 'noreferrer';
      link.textContent = item.cdnUrl;

      const itemMeta = document.createElement('div');
      const sizeMb = (item.bytes / (1024 * 1024)).toFixed(2);
      itemMeta.className = 'meta';
      itemMeta.textContent = `${item.fileName} • ${sizeMb} MB${item.compressed ? ' (compressed)' : ''}`;

      row.appendChild(link);
      row.appendChild(itemMeta);
      resultList.appendChild(row);
    });

    result.classList.add('visible');
    copyBtn.disabled = currentCdnUrls.length === 0;
    setStatus('Complete');
  } catch (err) {
    setStatus('Error');
    alert(err.message);
  } finally {
    uploadBtn.disabled = currentFiles.length === 0;
  }
});

copyBtn.addEventListener('click', async () => {
  if (!currentCdnUrls.length) return;
  await navigator.clipboard.writeText(currentCdnUrls.join('\n'));
  setStatus('Copied');
});

setFiles([]);

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
