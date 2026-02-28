/**
 * MEDIA MANAGER - Enciclopedia Universitaria
 * Handles image/PDF upload, source management in editor sidebar
 */

const MediaManager = (() => {
  const API = window.EU_CONFIG.backendUrl;
  let articleId = null;
  let currentTab = 'images';
  let imagesData = [];
  let pdfsData = [];
  let sourcesData = { pdfs: [], links: [] };

  function init(artId) {
    articleId = artId;
    render();
    loadData();
  }

  async function loadData() {
    if (!articleId) return;
    
    // Load images
    try {
      const imgRes = await fetch(`${API}/api/media/article/${articleId}`);
      if (imgRes.ok) {
        imagesData = await imgRes.json();
      }
    } catch (e) {
      console.warn('Error loading images:', e);
    }

    // Load sources (PDFs + links)
    try {
      const srcRes = await Auth.authFetch(`${API}/api/sources/articles/${articleId}/sources`);
      if (srcRes?.ok) {
        sourcesData = await srcRes.json();
        pdfsData = sourcesData.pdfs || [];
      }
    } catch (e) {
      console.warn('Error loading sources:', e);
    }

    renderMediaList();
  }

  function render() {
    const container = document.getElementById('mediaManager');
    if (!container) return;

    container.innerHTML = `
      <div class="eu-media-manager">
        <div class="eu-media-header">
          <h5><i class="bi bi-folder2-open me-2"></i>Gestor de Archivos</h5>
          <button class="btn-close" onclick="MediaManager.close()"></button>
        </div>
        
        <!-- Tabs -->
        <ul class="eu-media-tabs nav nav-tabs" role="tablist">
          <li class="nav-item">
            <button class="nav-link ${currentTab === 'images' ? 'active' : ''}" 
                    data-bs-toggle="tab" data-bs-target="#tab-images" 
                    onclick="MediaManager.switchTab('images')">
              <i class="bi bi-image me-1"></i>Imágenes
            </button>
          </li>
          <li class="nav-item">
            <button class="nav-link ${currentTab === 'pdfs' ? 'active' : ''}" 
                    data-bs-toggle="tab" data-bs-target="#tab-pdfs"
                    onclick="MediaManager.switchTab('pdfs')">
              <i class="bi bi-file-earmark-pdf me-1"></i>PDFs
            </button>
          </li>
          <li class="nav-item">
            <button class="nav-link ${currentTab === 'sources' ? 'active' : ''}" 
                    data-bs-toggle="tab" data-bs-target="#tab-sources"
                    onclick="MediaManager.switchTab('sources')">
              <i class="bi bi-link-45deg me-1"></i>Fuentes
            </button>
          </li>
        </ul>

        <!-- Tab Content -->
        <div class="tab-content eu-media-content">
          <!-- Images Tab -->
          <div class="tab-pane fade ${currentTab === 'images' ? 'show active' : ''}" id="tab-images">
            <div class="eu-media-upload" id="imageUploadZone">
              <input type="file" id="imageInput" accept="image/*" multiple hidden>
              <div class="eu-media-upload-box" onclick="document.getElementById('imageInput').click()">
                <i class="bi bi-cloud-arrow-up"></i>
                <span>Subir imágenes</span>
                <small>Max 5MB, hasta 20 por artículo</small>
              </div>
              <div class="progress-bar d-none" id="imageProgress"></div>
            </div>
            <div class="eu-media-list" id="imagesList">
              <div class="text-center text-muted p-3">Cargando...</div>
            </div>
          </div>

          <!-- PDFs Tab -->
          <div class="tab-pane fade ${currentTab === 'pdfs' ? 'show active' : ''}" id="tab-pdfs">
            <div class="eu-media-upload">
              <input type="file" id="pdfInput" accept="application/pdf" multiple hidden>
              <div class="eu-media-upload-box" onclick="document.getElementById('pdfInput').click()">
                <i class="bi bi-file-earmark-arrow-up"></i>
                <span>Subir PDF</span>
                <small>Max 10MB, hasta 5 por artículo</small>
              </div>
              <div class="progress-bar d-none" id="pdfProgress"></div>
            </div>
            <div class="eu-media-list" id="pdfsList">
              <div class="text-center text-muted p-3">Cargando...</div>
            </div>
          </div>

          <!-- Sources Tab -->
          <div class="tab-pane fade ${currentTab === 'sources' ? 'show active' : ''}" id="tab-sources">
            <div class="eu-sources-form">
              <div class="mb-2">
                <input type="text" id="sourceTitle" class="eu-input" placeholder="Título de la fuente" style="font-size:0.85rem">
              </div>
              <div class="mb-2">
                <input type="url" id="sourceUrl" class="eu-input" placeholder="https://ejemplo.com" style="font-size:0.85rem">
              </div>
              <button class="eu-btn-primary btn-sm w-100" onclick="MediaManager.addLinkSource()">
                <i class="bi bi-link-45deg me-1"></i>Añadir enlace
              </button>
            </div>
            <div class="eu-media-list" id="sourcesList">
              <div class="text-center text-muted p-3">Cargando...</div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Attach event listeners
    attachEventListeners();
    renderMediaList();
  }

  function attachEventListeners() {
    // Image upload
    const imageInput = document.getElementById('imageInput');
    if (imageInput) {
      imageInput.addEventListener('change', handleImageUpload);
    }

    // PDF upload
    const pdfInput = document.getElementById('pdfInput');
    if (pdfInput) {
      pdfInput.addEventListener('change', handlePdfUpload);
    }
  }

  async function handleImageUpload(e) {
    const files = e.target.files;
    if (!files.length) return;

    const progressEl = document.getElementById('imageProgress');
    progressEl.classList.remove('d-none');
    progressEl.style.width = '0%';

    const formData = new FormData();
    for (const file of files) {
      formData.append('images', file);
    }
    if (articleId) {
      formData.append('articleId', articleId);
    }

    try {
      const res = await Auth.authFetch(`${API}/api/media/upload`, {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al subir imagen');
      }

      const data = await res.json();
      
      // Add new images to list
      if (data.files) {
        imagesData = [...imagesData, ...data.files];
      }

      progressEl.style.width = '100%';
      setTimeout(() => progressEl.classList.add('d-none'), 1000);

      window.showToast(`${data.files?.length || files.length} imagen(es) subida(s)`, 'success');
      renderMediaList();
    } catch (err) {
      window.showToast(err.message, 'error');
      progressEl.classList.add('d-none');
    }

    e.target.value = '';
  }

  async function handlePdfUpload(e) {
    const files = e.target.files;
    if (!files.length) return;

    const progressEl = document.getElementById('pdfProgress');
    progressEl.classList.remove('d-none');
    progressEl.style.width = '0%';

    const file = files[0]; // Only one PDF at a time
    const title = file.name.replace(/\.pdf$/i, '');

    const formData = new FormData();
    formData.append('pdf', file);
    formData.append('title', title);

    try {
      const res = await Auth.authFetch(`${API}/api/sources/articles/${articleId}/sources/pdf`, {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al subir PDF');
      }

      const data = await res.json();
      
      if (data.source) {
        pdfsData = [...pdfsData, data.source];
      }

      progressEl.style.width = '100%';
      setTimeout(() => progressEl.classList.add('d-none'), 1000);

      window.showToast('PDF subido exitosamente', 'success');
      renderMediaList();
    } catch (err) {
      window.showToast(err.message, 'error');
      progressEl.classList.add('d-none');
    }

    e.target.value = '';
  }

  async function addLinkSource() {
    const title = document.getElementById('sourceTitle')?.value.trim();
    const url = document.getElementById('sourceUrl')?.value.trim();

    if (!title || !url) {
      window.showToast('El título y la URL son obligatorios', 'warning');
      return;
    }

    try {
      const res = await Auth.authFetch(`${API}/api/sources/articles/${articleId}/sources`, {
        method: 'POST',
        body: JSON.stringify({ type: 'link', title, url })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al añadir enlace');
      }

      const data = await res.json();
      
      if (data.source) {
        sourcesData.links = [...(sourcesData.links || []), data.source];
      }

      document.getElementById('sourceTitle').value = '';
      document.getElementById('sourceUrl').value = '';

      window.showToast('Enlace añadido exitosamente', 'success');
      renderMediaList();
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  }

  async function deleteSource(sourceId) {
    if (!confirm('¿Eliminar esta fuente?')) return;

    try {
      const res = await Auth.authFetch(`${API}/api/sources/articles/${articleId}/sources/${sourceId}`, {
        method: 'DELETE'
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al eliminar');
      }

      sourcesData.links = sourcesData.links.filter(s => s.id !== sourceId);
      pdfsData = pdfsData.filter(s => s.id !== sourceId);

      window.showToast('Fuente eliminada', 'success');
      renderMediaList();
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  }

  function renderMediaList() {
    // Render images
    const imagesList = document.getElementById('imagesList');
    if (imagesList) {
      if (!imagesData.length) {
        imagesList.innerHTML = '<div class="text-center text-muted p-3 small">No hay imágenes</div>';
      } else {
        imagesList.innerHTML = imagesData.map(img => `
          <div class="eu-media-item" onclick="MediaManager.copyImageShortcode('${img.publicUrl}')">
            <img src="${img.publicUrl}" alt="${img.filename}" class="eu-media-thumb">
            <div class="eu-media-info">
              <div class="eu-media-name">${img.filename}</div>
              <div class="eu-media-action">Click para shortcode</div>
            </div>
            <button class="eu-media-delete" onclick="event.stopPropagation(); MediaManager.deleteImage(${img.id})" title="Eliminar">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        `).join('');
      }
    }

    // Render PDFs
    const pdfsList = document.getElementById('pdfsList');
    if (pdfsList) {
      const allPdfs = [...(sourcesData.pdfs || []), ...pdfsData];
      if (!allPdfs.length) {
        pdfsList.innerHTML = '<div class="text-center text-muted p-3 small">No hay PDFs</div>';
      } else {
        pdfsList.innerHTML = allPdfs.map(pdf => `
          <div class="eu-media-item">
            <div class="eu-media-icon pdf-icon">
              <i class="bi bi-file-earmark-pdf-fill"></i>
            </div>
            <div class="eu-media-info">
              <div class="eu-media-name">${pdf.title || pdf.pdf_original_name}</div>
              <div class="eu-media-action">${formatFileSize(pdf.pdf_size)}</div>
            </div>
            <button class="eu-media-delete" onclick="MediaManager.deleteSource(${pdf.id})" title="Eliminar">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        `).join('');
      }
    }

    // Render links
    const sourcesList = document.getElementById('sourcesList');
    if (sourcesList) {
      const links = sourcesData.links || [];
      if (!links.length) {
        sourcesList.innerHTML = '<div class="text-center text-muted p-3 small">No hay fuentes</div>';
      } else {
        sourcesList.innerHTML = links.map(link => `
          <div class="eu-media-item">
            <img src="${link.favicon_url}" alt="" class="eu-media-icon favicon" onerror="this.style.display='none'">
            <div class="eu-media-info">
              <div class="eu-media-name">${link.title}</div>
              <a href="${link.url}" target="_blank" class="eu-media-action">${new URL(link.url).hostname}</a>
            </div>
            <button class="eu-media-delete" onclick="MediaManager.deleteSource(${link.id})" title="Eliminar">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        `).join('');
      }
    }
  }

  function copyImageShortcode(url) {
    const shortcode = `[img file="${url}" alt=""]`;
    navigator.clipboard.writeText(shortcode).then(() => {
      window.showToast('Shortcode copiado: ' + shortcode, 'success');
    });
  }

  function switchTab(tab) {
    currentTab = tab;
    render();
  }

  function close() {
    const container = document.getElementById('mediaManager');
    if (container) {
      container.innerHTML = '';
      container.classList.add('d-none');
    }
  }

  function formatFileSize(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  // Global functions for inline handlers
  window.MediaManager = {
    init,
    switchTab,
    close,
    addLinkSource,
    deleteSource,
    copyImageShortcode,
    deleteImage: async function(id) {
      // For now, just reload - full delete would need endpoint
      window.showToast('Funcionalidad de eliminación en desarrollo', 'warning');
    }
  };

  return {
    init,
    switchTab,
    close,
    addLinkSource,
    deleteSource
  };
})();

window.MediaManager = MediaManager;
