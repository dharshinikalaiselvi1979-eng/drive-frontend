import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

function App() {
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState('login');
  const [authMessage, setAuthMessage] = useState('');

  const [files, setFiles] = useState([]);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [viewMode, setViewMode] = useState('grid');

  const [toasts, setToasts] = useState([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [activeNav, setActiveNav] = useState('drive');

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [previewFile, setPreviewFile] = useState(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  /* ---------- folders + trash state ---------- */
  const [folders, setFolders] = useState([]);
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [breadcrumb, setBreadcrumb] = useState([]);
  const [trashFiles, setTrashFiles] = useState([]);
  const [trashFolders, setTrashFolders] = useState([]);
  /* allFiles = ALL user files across every folder, used for stats only */
  const [allFiles, setAllFiles] = useState([]);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renamingFolderId, setRenamingFolderId] = useState(null);
  const [renameFolderValue, setRenameFolderValue] = useState('');

  const authHeader = () => ({ Authorization: `Bearer ${session.access_token}` });

  const showToast = (text, type = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  };

  // Keep Render free-tier backend alive — ping every 10 minutes so it never sleeps
  useEffect(() => {
    const ping = () => fetch(`${API_URL}/`).catch(() => {});
    ping(); // immediate warm-up on page load
    const interval = setInterval(ping, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    if (activeNav === 'trash') {
      fetchTrash();
    } else {
      fetchFiles();
      fetchFolders();
      fetchBreadcrumb();
    }
    fetchAllFilesStats();
    setSelectedIds(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, activeNav, currentFolderId]);

  const fetchFiles = async () => {
    setLoadingFiles(true);
    try {
      const url = (activeNav === 'recent' || activeNav === 'starred')
        ? `${API_URL}/files?all=true`
        : currentFolderId
        ? `${API_URL}/files?folder_id=${currentFolderId}`
        : `${API_URL}/files`;
      const res = await fetch(url, { headers: authHeader() });
      const data = await res.json();
      setFiles(Array.isArray(data) ? data : []);
    } catch (err) {
      showToast('Failed to load files: ' + err.message, 'error');
    } finally {
      setLoadingFiles(false);
    }
  };

  const fetchFolders = async () => {
    try {
      const url = (activeNav === 'starred' || activeNav === 'recent')
        ? `${API_URL}/folders?all=true`
        : currentFolderId
        ? `${API_URL}/folders?parent_id=${currentFolderId}`
        : `${API_URL}/folders`;
      const res = await fetch(url, { headers: authHeader() });
      const data = await res.json();
      setFolders(Array.isArray(data) ? data : []);
    } catch (err) {
      showToast('Failed to load folders: ' + err.message, 'error');
    }
  };

  const fetchBreadcrumb = async () => {
    if (!currentFolderId) {
      setBreadcrumb([]);
      return;
    }
    try {
      const res = await fetch(`${API_URL}/folders/${currentFolderId}/path`, { headers: authHeader() });
      const data = await res.json();
      setBreadcrumb(Array.isArray(data) ? data : []);
    } catch (err) {
      /* breadcrumb is cosmetic, fail quietly */
    }
  };

  /* Fetch ALL files (across every folder) purely for the storage stats */
  const fetchAllFilesStats = async () => {
    try {
      const res = await fetch(`${API_URL}/files?all=true`, { headers: authHeader() });
      const data = await res.json();
      setAllFiles(Array.isArray(data) ? data : []);
    } catch {
      /* stats are non-critical, fail silently */
    }
  };

  const fetchTrash = async () => {
    setLoadingFiles(true);
    try {
      const [filesRes, foldersRes] = await Promise.all([
        fetch(`${API_URL}/files/trash`, { headers: authHeader() }),
        fetch(`${API_URL}/folders/trash`, { headers: authHeader() })
      ]);
      const filesData = await filesRes.json();
      const foldersData = await foldersRes.json();
      setTrashFiles(Array.isArray(filesData) ? filesData : []);
      setTrashFolders(Array.isArray(foldersData) ? foldersData : []);
    } catch (err) {
      showToast('Failed to load trash: ' + err.message, 'error');
    } finally {
      setLoadingFiles(false);
    }
  };

  const handleAuth = async () => {
    setAuthMessage('');
    if (authMode === 'signup') {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setAuthMessage(error.message);
      } else {
        setAuthMessage('Signed up! You are now logged in.');
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setAuthMessage(error.message);
      }
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setFiles([]);
    setFolders([]);
    setTrashFiles([]);
    setCurrentFolderId(null);
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      uploadFiles(Array.from(e.target.files));
    }
    e.target.value = '';
  };

  /* ---------- folder upload: picker (webkitdirectory input) ---------- */
  const handleFolderInputChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const entries = Array.from(e.target.files).map((file) => ({
        file,
        // webkitRelativePath looks like "MyFolder/sub/file.txt"
        relativePath: file.webkitRelativePath || file.name
      }));
      uploadFilesWithRelativePaths(entries);
    }
    e.target.value = '';
  };

  const requestDelete = (id) => setConfirmDeleteId(id);

  const confirmDelete = async () => {
    const id = confirmDeleteId;
    setConfirmDeleteId(null);
    try {
      const res = await fetch(`${API_URL}/files/${id}`, {
        method: 'DELETE',
        headers: authHeader()
      });
      const data = await res.json();
      if (data.success) {
        showToast('File moved to trash');
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        fetchFiles();
        fetchAllFilesStats();
      } else {
        showToast('Delete failed: ' + data.error, 'error');
      }
    } catch (err) {
      showToast('Delete error: ' + err.message, 'error');
    }
  };

  const bulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkDeleting(true);
    let deleted = 0;
    for (const id of ids) {
      try {
        const res = await fetch(`${API_URL}/files/${id}`, {
          method: 'DELETE',
          headers: authHeader()
        });
        const data = await res.json();
        if (data.success) deleted++;
      } catch (err) {
        /* continue */
      }
    }
    setBulkDeleting(false);
    setSelectedIds(new Set());
    showToast(`Moved ${deleted} file${deleted !== 1 ? 's' : ''} to trash`);
    fetchFiles();
    fetchAllFilesStats();
  };

  const restoreFile = async (id) => {
    try {
      const res = await fetch(`${API_URL}/files/${id}/restore`, {
        method: 'PATCH',
        headers: authHeader()
      });
      const data = await res.json();
      if (data.success) {
        showToast('File restored');
        fetchTrash();
        fetchAllFilesStats();
      } else {
        showToast('Restore failed: ' + data.error, 'error');
      }
    } catch (err) {
      showToast('Restore error: ' + err.message, 'error');
    }
  };

  const permanentlyDeleteFile = async (id) => {
    try {
      const res = await fetch(`${API_URL}/files/${id}/permanent`, {
        method: 'DELETE',
        headers: authHeader()
      });
      const data = await res.json();
      if (data.success) {
        showToast('File permanently deleted');
        fetchTrash();
        fetchAllFilesStats();
      } else {
        showToast('Permanent delete failed: ' + data.error, 'error');
      }
    } catch (err) {
      showToast('Permanent delete error: ' + err.message, 'error');
    }
  };

  const startRename = (file) => {
    setRenamingId(file.id);
    setRenameValue(file.name);
  };

  const saveRename = async (id) => {
    const trimmed = renameValue.trim();
    setRenamingId(null);
    if (!trimmed) return;

    try {
      const res = await fetch(`${API_URL}/files/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader()
        },
        body: JSON.stringify({ name: trimmed })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Renamed successfully');
        fetchFiles();
      } else {
        showToast('Rename failed: ' + data.error, 'error');
      }
    } catch (err) {
      showToast('Rename error: ' + err.message, 'error');
    }
  };

  const toggleStar = async (file) => {
    try {
      const res = await fetch(`${API_URL}/files/${file.id}/star`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader()
        },
        body: JSON.stringify({ starred: !file.starred })
      });
      const data = await res.json();
      if (data.success) {
        setFiles((prev) =>
          prev.map((f) => (f.id === file.id ? { ...f, starred: data.record.starred } : f))
        );
      } else {
        showToast('Star failed: ' + data.error, 'error');
      }
    } catch (err) {
      showToast('Star error: ' + err.message, 'error');
    }
  };

  const toggleFolderStar = async (folder) => {
    try {
      const res = await fetch(`${API_URL}/folders/${folder.id}/star`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader()
        },
        body: JSON.stringify({ starred: !folder.starred })
      });
      const data = await res.json();
      if (data.success) {
        setFolders((prev) =>
          prev.map((f) => (f.id === folder.id ? { ...f, starred: data.record.starred } : f))
        );
      } else {
        showToast('Star failed: ' + data.error, 'error');
      }
    } catch (err) {
      showToast('Star error: ' + err.message, 'error');
    }
  };

  const startRenameFolder = (folder) => {
    setRenamingFolderId(folder.id);
    setRenameFolderValue(folder.name);
  };

  const saveRenameFolder = async (id) => {
    const trimmed = renameFolderValue.trim();
    setRenamingFolderId(null);
    if (!trimmed) return;

    try {
      const res = await fetch(`${API_URL}/folders/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader()
        },
        body: JSON.stringify({ name: trimmed })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Folder renamed');
        fetchFolders();
      } else {
        showToast('Rename failed: ' + data.error, 'error');
      }
    } catch (err) {
      showToast('Rename error: ' + err.message, 'error');
    }
  };

  const trashFolder = async (folderId) => {
    try {
      const res = await fetch(`${API_URL}/folders/${folderId}`, {
        method: 'DELETE',
        headers: authHeader()
      });
      const data = await res.json();
      if (data.success) {
        showToast('Folder moved to trash');
        fetchFolders();
      } else {
        showToast('Delete failed: ' + data.error, 'error');
      }
    } catch (err) {
      showToast('Delete error: ' + err.message, 'error');
    }
  };

  const restoreFolder = async (id) => {
    try {
      const res = await fetch(`${API_URL}/folders/${id}/restore`, {
        method: 'PATCH',
        headers: authHeader()
      });
      const data = await res.json();
      if (data.success) {
        showToast('Folder restored');
        fetchTrash();
      } else {
        showToast('Restore failed: ' + data.error, 'error');
      }
    } catch (err) {
      showToast('Restore error: ' + err.message, 'error');
    }
  };

  const permanentlyDeleteFolder = async (id) => {
    try {
      const res = await fetch(`${API_URL}/folders/${id}/permanent`, {
        method: 'DELETE',
        headers: authHeader()
      });
      const data = await res.json();
      if (data.success) {
        showToast('Folder permanently deleted');
        fetchTrash();
      } else {
        showToast('Permanent delete failed: ' + data.error, 'error');
      }
    } catch (err) {
      showToast('Permanent delete error: ' + err.message, 'error');
    }
  };

  const openFolder = (folder) => {
    setActiveNav('drive');
    setSearchTerm('');
    setCurrentFolderId(folder.id);
  };

  const goToBreadcrumb = (folderId) => {
    setSearchTerm('');
    setCurrentFolderId(folderId);
  };

  const startCreateFolder = () => {
    setCreatingFolder(true);
    setNewFolderName('');
  };

  const saveNewFolder = async () => {
    const trimmed = newFolderName.trim();
    setCreatingFolder(false);
    if (!trimmed) return;

    try {
      const res = await fetch(`${API_URL}/folders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader()
        },
        body: JSON.stringify({ name: trimmed, parent_id: currentFolderId })
      });
      const data = await res.json();
      if (data.id) {
        showToast('Folder created');
        fetchFolders();
      } else {
        showToast('Folder creation failed: ' + (data.error || 'unknown error'), 'error');
      }
    } catch (err) {
      showToast('Folder error: ' + err.message, 'error');
    }
  };

  /* ---------- folder upload: create/reuse nested folders for a relative path ---------- */
  // pathParts e.g. ['components', 'ui'] (folder names only, no filename)
  // cache maps "a/b" -> folder id, scoped to a single upload batch
  const ensureFolderPath = async (pathParts, cache) => {
    let parentId = currentFolderId;
    let pathKey = '';

    for (const part of pathParts) {
      pathKey = pathKey ? `${pathKey}/${part}` : part;

      if (cache.has(pathKey)) {
        parentId = cache.get(pathKey);
        continue;
      }

      const res = await fetch(`${API_URL}/folders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader()
        },
        body: JSON.stringify({ name: part, parent_id: parentId })
      });
      const data = await res.json();

      if (!data.id) {
        throw new Error(data.error || `Could not create folder "${part}"`);
      }

      cache.set(pathKey, data.id);
      parentId = data.id;
    }

    return parentId;
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragging(false);

    const items = e.dataTransfer.items;

    if (items && items.length > 0 && items[0].webkitGetAsEntry) {
      const topLevelEntries = Array.from(items)
        .map((item) => item.webkitGetAsEntry())
        .filter(Boolean);

      const hasDirectory = topLevelEntries.some((entry) => entry.isDirectory);

      if (hasDirectory) {
        const filesOut = [];
        for (const entry of topLevelEntries) {
          await traverseFileTree(entry, '', filesOut);
        }
        uploadFilesWithRelativePaths(filesOut);
        return;
      }
    }

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      uploadFiles(Array.from(e.dataTransfer.files));
    }
  };

  // Recursively walks a dropped FileSystemEntry (file or directory),
  // collecting { file, relativePath } pairs into filesOut.
  const traverseFileTree = (entry, path, filesOut) => {
    return new Promise((resolve) => {
      if (entry.isFile) {
        entry.file(
          (file) => {
            filesOut.push({ file, relativePath: `${path}${file.name}` });
            resolve();
          },
          () => resolve()
        );
      } else if (entry.isDirectory) {
        const dirReader = entry.createReader();
        const allEntries = [];

        const readBatch = () => {
          dirReader.readEntries(async (batch) => {
            if (batch.length === 0) {
              for (const child of allEntries) {
                await traverseFileTree(child, `${path}${entry.name}/`, filesOut);
              }
              resolve();
            } else {
              // directory readers can cap at ~100 entries per call, so keep reading
              allEntries.push(...batch);
              readBatch();
            }
          }, () => resolve());
        };

        readBatch();
      } else {
        resolve();
      }
    });
  };

  const uploadOneFile = (file, folderId) => {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append('file', file);
      if (folderId) {
        formData.append('folder_id', folderId);
      }

      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_URL}/upload`);
      xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);

      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText);
          if (data.success) {
            resolve();
          } else {
            reject(data.error || 'Upload failed');
          }
        } catch (err) {
          reject('Could not parse response');
        }
      };

      xhr.onerror = () => reject('Network failure');

      xhr.send(formData);
    });
  };

  const uploadFiles = async (fileArray) => {
    setUploading(true);
    setUploadProgress(0);

    let completed = 0;
    let failedFiles = [];

    for (const file of fileArray) {
      try {
        await uploadOneFile(file, currentFolderId);
        completed++;
        setUploadProgress(Math.round((completed / fileArray.length) * 100));
      } catch (err) {
        failedFiles.push(file.name);
      }
    }

    setUploading(false);

    if (failedFiles.length === 0) {
      showToast(`Uploaded ${completed} file(s) successfully!`);
    } else {
      showToast(`Uploaded ${completed}, failed: ${failedFiles.join(', ')}`, 'error');
    }

    fetchFiles();
    fetchAllFilesStats();
  };

  // Uploads files that came with a relative path (folder picker or folder drag-drop),
  // recreating the folder structure via /folders, then uploading each file into place.
  const uploadFilesWithRelativePaths = async (entries) => {
    if (!entries || entries.length === 0) return;

    setUploading(true);
    setUploadProgress(0);

    const folderCache = new Map();
    let completed = 0;
    let failedFiles = [];

    for (const { file, relativePath } of entries) {
      try {
        const parts = relativePath.split('/').filter(Boolean);
        const folderParts = parts.slice(0, -1); // everything except the filename itself

        const folderId = folderParts.length > 0
          ? await ensureFolderPath(folderParts, folderCache)
          : currentFolderId;

        await uploadOneFile(file, folderId);
        completed++;
        setUploadProgress(Math.round((completed / entries.length) * 100));
      } catch (err) {
        failedFiles.push(relativePath);
      }
    }

    setUploading(false);

    if (failedFiles.length === 0) {
      showToast(`Uploaded ${completed} file(s) successfully!`);
    } else {
      showToast(`Uploaded ${completed}, failed: ${failedFiles.join(', ')}`, 'error');
    }

    fetchFiles();
    fetchFolders();
    fetchAllFilesStats();
  };

  const isImage = (name) => /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|tiff)$/i.test(name);
  const isVideo = (name) => /\.(mp4|webm|ogg|mov)$/i.test(name);
  const isAudio = (name) => /\.(mp3|wav|ogg|aac|flac|m4a)$/i.test(name);
  const isPdf = (name) => /\.pdf$/i.test(name);

  /* bg is now a Tailwind className instead of a hex string */
  const getFileMeta = (name) => {
    const ext = name.split('.').pop().toLowerCase();
    if (ext === 'pdf') return { emoji: '📕', bg: 'bg-pink-100' };
    if (['doc', 'docx'].includes(ext)) return { emoji: '📘', bg: 'bg-chip-blue' };
    if (['xls', 'xlsx', 'csv'].includes(ext)) return { emoji: '📊', bg: 'bg-chip-green' };
    if (['zip', 'rar', '7z'].includes(ext)) return { emoji: '🗜️', bg: 'bg-chip-orange' };
    if (['mp3', 'wav'].includes(ext)) return { emoji: '🎵', bg: 'bg-pink-100' };
    if (['mp4', 'mov', 'avi'].includes(ext)) return { emoji: '🎬', bg: 'bg-chip-teal' };
    if (['js', 'jsx', 'ts', 'tsx', 'json', 'html', 'css'].includes(ext)) return { emoji: '💻', bg: 'bg-chip-blue' };
    return { emoji: '📄', bg: 'bg-chip-teal' };
  };

  const getFilteredAndSortedFiles = () => {
    let result = files.filter((f) =>
      f.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (sortBy === 'newest') {
      result = result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } else if (sortBy === 'oldest') {
      result = result.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    } else if (sortBy === 'name') {
      result = result.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'largest') {
      result = result.sort((a, b) => b.size - a.size);
    }

    return result;
  };

  const getNavFilteredFiles = (list) => {
    if (activeNav === 'starred') return list.filter((f) => f.starred);
    if (activeNav === 'recent') return [...list].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return list;
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const totalStorage = allFiles.reduce((sum, f) => sum + f.size, 0);
  const STORAGE_LIMIT = 1024 * 1024 * 1024;
  const storagePercent = Math.min(100, (totalStorage / STORAGE_LIMIT) * 100);

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const initials = session?.user?.email ? session.user.email[0].toUpperCase() : '?';

  /* Only the things Tailwind utility classes genuinely can't express live here:
     the font import, keyframes, hover pseudo-classes, and scrollbar styling. */
  const GlobalStyle = () => (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap');
      * { box-sizing: border-box; }

      .file-tile, .file-row { transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.2s ease, background-color 0.15s ease; }
      .file-tile:hover { transform: translateY(-4px); border-color: #5eead4; box-shadow: 0 14px 28px rgba(13,148,136,0.16); }
      .file-tile:hover .select-check, .file-tile.selected .select-check { opacity: 1; }
      .file-row:hover { background-color: #f0fdfa; }
      .file-row.selected { background-color: #ccfbf1; }

      .select-check { opacity: 0; transition: opacity 0.15s ease, background-color 0.15s ease, border-color 0.15s ease; cursor: pointer; }
      .select-check.checked { opacity: 1 !important; }

      .delete-btn { transition: background-color 0.15s ease, color 0.15s ease; }
      .delete-btn:hover { background-color: #EF4444; color: #fff; }
      .rename-btn:hover { color: #0d9488; }
      .restore-btn:hover { background-color: #10B981; color: #fff; }

      .new-btn { transition: transform 0.15s ease, box-shadow 0.15s ease; cursor: pointer; }
      .new-btn:hover { transform: translateY(-1px); box-shadow: 0 10px 24px rgba(13,148,136,0.38); }

      .folder-btn:hover { border-color: #5eead4; background-color: #ccfbf1; }

      .logout-btn:hover { border-color: #0d9488; color: #0d9488; background-color: #ccfbf1; }
      .signin-btn { transition: transform 0.15s ease, box-shadow 0.2s ease; cursor: pointer; }
      .signin-btn:hover { transform: translateY(-1px); box-shadow: 0 12px 26px rgba(13,148,136,0.4); }

      .nav-item { transition: background-color 0.15s ease, color 0.15s ease; cursor: pointer; }
      .nav-item:hover { background-color: #ccfbf1; color: #6D28D9; }

      .view-toggle-btn { transition: background-color 0.15s ease, color 0.15s ease; cursor: pointer; }
      .view-toggle-btn:hover { background-color: #ccfbf1; color: #0d9488; }

      .search-pill { transition: box-shadow 0.15s ease, border-color 0.15s ease, background-color 0.15s ease; }
      .search-pill:focus-within { border-color: #5eead4; box-shadow: 0 0 0 4px rgba(13,148,136,0.12); background-color: #fff; }

      .sort-pill { transition: border-color 0.15s ease; cursor: pointer; }
      .sort-pill:hover, .sort-pill:focus { border-color: #5eead4; outline: none; }

      .avatar-ring { transition: box-shadow 0.15s ease, transform 0.15s ease; cursor: pointer; }
      .avatar-ring:hover { box-shadow: 0 0 0 4px rgba(13,148,136,0.18); transform: translateY(-1px); }

      .bulk-bar-clear:hover { text-decoration: underline; }

      .switch-link:hover { text-decoration: underline; }
      .breadcrumb-link:hover { text-decoration: underline; cursor: pointer; }

      @keyframes shimmer { 0% { background-position: -300px 0; } 100% { background-position: 300px 0; } }
      .skeleton { background: linear-gradient(90deg, #F1ECFA 25%, #F8F6FC 50%, #F1ECFA 75%); background-size: 600px 100%; animation: shimmer 1.3s infinite; border-radius: 14px; }

      @keyframes slideIn { from { transform: translateX(120%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
      .toast { animation: slideIn 0.25s ease; }

      @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
      .fade-in { animation: fadeIn 0.25s ease; }

      @keyframes modalIn { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
      .modal-card { animation: modalIn 0.15s ease; }

      @keyframes floatSlow { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-10px); } }

      ::-webkit-scrollbar { width: 10px; height: 10px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: #DCCFF3; border-radius: 6px; }
      ::-webkit-scrollbar-thumb:hover { background: #5eead4; }
    `}</style>
  );

  /* ---------------------------- AUTH SCREEN ---------------------------- */
  if (!session) {
    return (
      <div className="flex min-h-screen w-screen font-sans">
        <GlobalStyle />
        <div className="flex-none w-[46%] bg-drive-gradient text-white py-12 px-14 flex flex-col justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">☁️</span>
            <span className="font-heading text-[19px] font-bold text-white">StackDrive</span>
          </div>

          <div className="max-w-[480px]">
            <div className="flex items-center gap-2.5 mb-[22px]">
              <span className="w-7 h-0.5 bg-white/60" />
              <span className="text-xs tracking-[1.5px] font-bold text-white/85">SECURE FILE STORAGE</span>
            </div>
            <h1 className="font-heading text-[46px] leading-[1.1] font-extrabold mt-0 mb-5">
              Your files,
              <br />
              <span className="text-teal-200">organized beautifully.</span>
            </h1>
            <p className="text-[15px] leading-relaxed text-white/85 mb-6 max-w-[420px]">
              Upload, search, and share anything in seconds. One home for
              every document, photo, and project — always within reach.
            </p>

            <div className="flex flex-wrap gap-2.5">
              <span className="bg-white/[0.14] border border-white/25 rounded-full px-3.5 py-2 text-[12.5px] font-semibold">📁 Drag &amp; drop uploads</span>
              <span className="bg-white/[0.14] border border-white/25 rounded-full px-3.5 py-2 text-[12.5px] font-semibold">🔎 Instant search</span>
              <span className="bg-white/[0.14] border border-white/25 rounded-full px-3.5 py-2 text-[12.5px] font-semibold">🔒 Private &amp; secure</span>
            </div>
          </div>

          <p className="text-[12.5px] italic text-white/65 max-w-[420px]">
            "A tidy drive is a tidy mind — keep everything one search away."
          </p>
        </div>

        <div className="flex-1 bg-drive-bg flex items-center justify-center p-10">
          <div className="w-full max-w-[400px]">
            <h2 className="font-heading text-[30px] font-extrabold text-drive-text mt-0 mb-1.5">
              {authMode === 'login' ? 'Welcome back' : 'Create your account'}
            </h2>
            <p className="text-sm text-drive-muted mb-[26px]">
              {authMode === 'login'
                ? 'Sign in to get back to your files.'
                : 'Start storing and sharing in minutes.'}
            </p>

            <label className="block text-[11.5px] font-bold tracking-wide text-drive-muted mb-2 mt-4">EMAIL ADDRESS</label>
            <div className="relative flex items-center">
              <span className="absolute left-3.5 text-sm opacity-55">✉️</span>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-drive-surface border-[1.5px] border-drive-border rounded-xl py-3.5 pl-10 pr-3.5 text-drive-text text-sm outline-none"
              />
            </div>

            <label className="block text-[11.5px] font-bold tracking-wide text-drive-muted mb-2 mt-4">PASSWORD</label>
            <div className="relative flex items-center">
              <span className="absolute left-3.5 text-sm opacity-55">🔒</span>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-drive-surface border-[1.5px] border-drive-border rounded-xl py-3.5 pl-10 pr-3.5 text-drive-text text-sm outline-none"
              />
            </div>

            <button onClick={handleAuth} className="signin-btn w-full bg-drive-gradient text-white border-none rounded-xl py-3.5 px-5 text-[15px] font-bold mt-6 flex items-center justify-center gap-2 shadow-[0_10px_24px_rgba(13,148,136,0.32)]">
              {authMode === 'login' ? 'Sign In' : 'Sign Up'} <span>→</span>
            </button>

            {authMessage && <p className="text-sm text-emerald-500 mt-2.5 text-center">{authMessage}</p>}

            <p className="text-[13px] text-drive-muted text-center mt-5">
              {authMode === 'login' ? "Don't have an account? " : 'Already have an account? '}
              <span
                className="switch-link text-teal-600 cursor-pointer font-bold"
                onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
              >
                {authMode === 'login' ? 'Create one free' : 'Log in'}
              </span>
            </p>
          </div>
        </div>
      </div>
    );
  }

  /* --------------------------- DRIVE DASHBOARD -------------------------- */
  const isTrashView = activeNav === 'trash';
  const visibleFiles = isTrashView
    ? trashFiles.filter((f) => f.name.toLowerCase().includes(searchTerm.toLowerCase()))
    : getNavFilteredFiles(getFilteredAndSortedFiles());
  const visibleFolders = isTrashView
    ? trashFolders.filter((f) => f.name.toLowerCase().includes(searchTerm.toLowerCase()))
    : (activeNav === 'drive' && !searchTerm) ? folders
    : (activeNav === 'starred' && !searchTerm) ? folders.filter((f) => f.starred)
    : (activeNav === 'recent') ? [...folders]
        .filter((f) => f.name.toLowerCase().includes(searchTerm.toLowerCase()))
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    : [];
  const nothingToShow = isTrashView
    ? visibleFiles.length === 0 && visibleFolders.length === 0
    : visibleFiles.length === 0 && visibleFolders.length === 0;

  return (
    <div className="flex h-screen w-screen bg-drive-bg text-drive-text font-sans overflow-hidden">
      <GlobalStyle />

      <div className="fixed top-5 right-5 flex flex-col gap-2 z-[1000]">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast bg-drive-surface border-[1.5px] rounded-xl py-2.5 px-4.5 text-[13px] font-medium shadow-[0_8px_22px_rgba(13,148,136,0.16)] max-w-[320px] ${
              t.type === 'error' ? 'border-red-500 text-red-500' : 'border-[#5eead4] text-teal-700'
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>

      {confirmDeleteId && (
        <div className="fixed inset-0 bg-[rgba(30,27,46,0.45)] flex items-center justify-center z-[999]">
          <div className="modal-card bg-drive-surface border border-drive-border rounded-[18px] p-[26px] max-w-[340px] w-[90%] text-center">
            <div className="w-[52px] h-[52px] rounded-full bg-red-100 flex items-center justify-center text-[22px] mx-auto mb-3.5">🗑️</div>
            <p className="text-base font-bold text-drive-text mt-0 mb-1">Delete this file?</p>
            <p className="mb-5 text-[13px] text-drive-muted">You can restore it from Trash later.</p>
            <div className="flex justify-center gap-2.5">
              <button onClick={() => setConfirmDeleteId(null)} className="bg-transparent text-drive-text border border-drive-border rounded-[10px] py-2.5 px-4.5 text-[13px] font-semibold cursor-pointer">
                Cancel
              </button>
              <button onClick={confirmDelete} className="bg-red-500 text-white border-none rounded-[10px] py-2.5 px-4.5 text-[13px] font-bold cursor-pointer">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {previewFile && (
        <div className="fixed inset-0 bg-[rgba(30,27,46,0.45)] flex items-center justify-center z-[999]" onClick={() => setPreviewFile(null)}>
          <div
            className="modal-card bg-drive-surface rounded-[18px] p-4.5 max-w-[640px] w-[90%] max-h-[82vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3.5">
              <span className="text-sm font-bold text-drive-text">{previewFile.name}</span>
              <button onClick={() => setPreviewFile(null)} className="bg-drive-bg border-none rounded-lg w-[30px] h-[30px] cursor-pointer text-drive-muted">✕</button>
            </div>
            <div className="flex-1 bg-drive-bg rounded-[14px] flex items-center justify-center overflow-hidden min-h-[260px]">
              {isImage(previewFile.name) && previewFile.url ? (
                <img src={previewFile.url} alt={previewFile.name} className="max-w-full max-h-[60vh] object-contain" />
              ) : isPdf(previewFile.name) && previewFile.url ? (
                <iframe src={previewFile.url} title={previewFile.name} className="w-full h-[60vh] border-none rounded-[14px]" />
              ) : isVideo(previewFile.name) && previewFile.url ? (
                <video src={previewFile.url} controls className="max-w-full max-h-[60vh] rounded-lg">
                  Your browser does not support the video tag.
                </video>
              ) : isAudio(previewFile.name) && previewFile.url ? (
                <div className="flex flex-col items-center gap-4 py-8">
                  <span className="text-[64px]">🎧</span>
                  <audio src={previewFile.url} controls className="w-[320px]">
                    Your browser does not support the audio tag.
                  </audio>
                </div>
              ) : previewFile.url ? (
                <div className="flex flex-col items-center gap-3 py-6">
                  <span className="text-[48px]">{getFileMeta(previewFile.name).emoji}</span>
                  <p className="text-drive-muted text-[13px]">Preview not supported for this file type</p>
                  <a href={previewFile.url} target="_blank" rel="noopener noreferrer" className="text-teal-600 text-[13px] font-bold no-underline hover:underline">Download to view ↓</a>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <span className="text-[48px]">{getFileMeta(previewFile.name).emoji}</span>
                  <p className="text-drive-muted text-[13px]">File URL unavailable</p>
                </div>
              )}
            </div>
            {previewFile.url && (
              <a href={previewFile.url} target="_blank" rel="noopener noreferrer" className="mt-3.5 text-center bg-drive-gradient text-white rounded-[10px] p-2.5 text-[13px] font-bold no-underline block">
                Open original ↗
              </a>
            )}
          </div>
        </div>
      )}

      {/* --------------------------- SIDEBAR --------------------------- */}
      <div className="w-[264px] flex-none bg-drive-surface border-r border-drive-border flex flex-col py-[22px] px-4">
        <div className="flex items-center gap-2.5 px-2 mb-[22px]">
          <span className="text-[22px]">☁️</span>
          <span className="font-heading text-[19px] font-bold text-drive-text">StackDrive</span>
        </div>

        <label className="new-btn bg-drive-gradient text-white border-none rounded-[14px] py-3.5 px-4.5 text-sm font-bold flex items-center justify-center gap-2 mb-2.5 shadow-[0_6px_18px_rgba(13,148,136,0.30)]">
          <span className="text-base">＋</span> New upload
          <input
            type="file"
            multiple
            onChange={handleFileChange}
            className="hidden"
          />
        </label>

        <label className="new-btn bg-drive-surface text-teal-700 border-[1.5px] border-drive-border rounded-[14px] py-3 px-4.5 text-sm font-bold flex items-center justify-center gap-2 mb-2.5 cursor-pointer">
          <span className="text-base">📤</span> Upload folder
          <input
            type="file"
            webkitdirectory=""
            directory=""
            multiple
            onChange={handleFolderInputChange}
            className="hidden"
          />
        </label>

        <button className="folder-btn bg-drive-surface text-drive-text border-[1.5px] border-drive-border rounded-[14px] py-2.5 px-4.5 text-sm font-bold flex items-center justify-center gap-2 mb-[22px] cursor-pointer" onClick={startCreateFolder}>
          <span className="text-[15px]">📁</span> New folder
        </button>

        <div className="flex flex-col gap-[3px] flex-1">
          <div
            className={`nav-item flex items-center gap-3 py-2.5 px-3 rounded-xl text-sm font-medium cursor-pointer ${activeNav === 'drive' ? 'bg-chip-teal text-teal-700 font-bold' : 'text-drive-muted'}`}
            onClick={() => { setActiveNav('drive'); setCurrentFolderId(null); }}
          >
            <span className="text-[15px]">🏠</span> My Drive
          </div>
          <div
            className={`nav-item flex items-center gap-3 py-2.5 px-3 rounded-xl text-sm font-medium cursor-pointer ${activeNav === 'recent' ? 'bg-chip-teal text-teal-700 font-bold' : 'text-drive-muted'}`}
            onClick={() => { setActiveNav('recent'); setCurrentFolderId(null); }}
          >
            <span className="text-[15px]">🕒</span> Recent
          </div>
          <div
            className={`nav-item flex items-center gap-3 py-2.5 px-3 rounded-xl text-sm font-medium cursor-pointer ${activeNav === 'starred' ? 'bg-chip-teal text-teal-700 font-bold' : 'text-drive-muted'}`}
            onClick={() => { setActiveNav('starred'); setCurrentFolderId(null); }}
          >
            <span className="text-[15px]">⭐</span> Starred
          </div>
          <div
            className={`nav-item flex items-center gap-3 py-2.5 px-3 rounded-xl text-sm font-medium cursor-pointer ${activeNav === 'trash' ? 'bg-chip-teal text-teal-700 font-bold' : 'text-drive-muted'}`}
            onClick={() => { setActiveNav('trash'); setCurrentFolderId(null); }}
          >
            <span className="text-[15px]">🗑️</span> Trash
          </div>
        </div>

        <div className="mt-auto p-3 px-3 bg-drive-bg rounded-[14px]">
          <div className="w-full h-1.5 bg-drive-border rounded overflow-hidden mb-2">
            <div className="h-full bg-drive-gradient rounded" style={{ width: `${storagePercent}%` }} />
          </div>
          <div className="text-xs text-drive-muted font-medium">
            {formatSize(totalStorage)} of {formatSize(STORAGE_LIMIT)} used
          </div>
        </div>
      </div>

      {/* --------------------------- MAIN AREA -------------------------- */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="h-[72px] flex-none flex items-center justify-between px-7 border-b border-drive-border bg-drive-surface">
          <div className="search-pill flex-1 max-w-[620px] relative flex items-center bg-drive-bg border border-drive-border rounded-full">
            <span className="absolute left-4 text-sm opacity-55">🔍</span>
            <input
              type="text"
              placeholder="Search in Drive"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-transparent border-none rounded-full py-3 pr-4 pl-[42px] text-drive-text text-sm outline-none"
            />
          </div>

          <div className="relative ml-5">
            <div className="avatar-ring w-[38px] h-[38px] rounded-full bg-drive-gradient text-white flex items-center justify-center text-sm font-bold cursor-pointer" onClick={() => setUserMenuOpen((o) => !o)}>
              {initials}
            </div>
            {userMenuOpen && (
              <div className="absolute top-12 right-0 bg-drive-surface border border-drive-border rounded-[14px] p-3.5 min-w-[210px] shadow-[0_12px_32px_rgba(13,148,136,0.16)] z-50">
                <div className="text-[13px] text-drive-muted mb-2.5 break-all">{session.user.email}</div>
                <button onClick={handleLogout} className="logout-btn w-full bg-transparent text-drive-text border border-drive-border rounded-[10px] py-2.5 px-3 text-[13px] font-semibold cursor-pointer">
                  Log out
                </button>
              </div>
            )}
          </div>
        </div>

        <div
          className="flex-1 overflow-y-auto py-[26px] px-8 relative"
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          {isDragging && (
            <div className="absolute inset-3.5 border-2 border-dashed border-teal-500 rounded-[20px] bg-teal-600/[0.06] flex flex-col items-center justify-center z-40">
              <div className="text-[34px] mb-2.5 animate-[floatSlow_2s_ease-in-out_infinite]">⬆️</div>
              <div className="font-heading text-[17px] font-bold text-teal-700">Drop files or a folder to upload</div>
            </div>
          )}

          <div className="mb-3.5 flex items-center gap-1.5 flex-wrap">
            {activeNav === 'drive' ? (
              <>
                <span
                  className="breadcrumb-link font-heading text-[22px] font-extrabold text-drive-text cursor-pointer"
                  onClick={() => setCurrentFolderId(null)}
                >
                  My Drive
                </span>
                {breadcrumb.map((crumb) => (
                  <span key={crumb.id} className="flex items-center gap-1.5">
                    <span className="text-drive-muted text-lg">/</span>
                    <span
                      className="breadcrumb-link font-heading text-[22px] font-extrabold text-drive-text cursor-pointer"
                      onClick={() => goToBreadcrumb(crumb.id)}
                    >
                      {crumb.name}
                    </span>
                  </span>
                ))}
              </>
            ) : (
              <span className="font-heading text-[22px] font-extrabold text-drive-text">
                {activeNav === 'recent' && 'Recent'}
                {activeNav === 'starred' && 'Starred'}
                {activeNav === 'trash' && 'Trash'}
              </span>
            )}
          </div>

          {creatingFolder && (
            <div className="flex items-center gap-2 bg-drive-surface border border-drive-border rounded-xl py-2.5 px-3.5 mb-3.5 max-w-[320px]">
              <span className="text-lg">📁</span>
              <input
                autoFocus
                placeholder="Folder name"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onBlur={saveNewFolder}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveNewFolder();
                  if (e.key === 'Escape') setCreatingFolder(false);
                }}
                className="w-full bg-chip-teal border border-teal-500 rounded-lg py-1.5 px-2.5 text-drive-text text-[13px] font-semibold"
              />
            </div>
          )}

          <div className="flex justify-between items-center mb-4 flex-wrap gap-2.5">
            <span className="text-[13px] text-drive-muted font-medium">
              {isTrashView
                ? `${trashFiles.length + trashFolders.length} item${(trashFiles.length + trashFolders.length) !== 1 ? 's' : ''} in trash`
                : (() => {
                    const fCount = visibleFiles.length;
                    const dCount = visibleFolders.length;
                    const viewSize = visibleFiles.reduce((sum, f) => sum + (f.size || 0), 0);
                    const folderStr = dCount > 0 ? `, ${dCount} folder${dCount !== 1 ? 's' : ''}` : '';
                    return `${fCount} file${fCount !== 1 ? 's' : ''}${folderStr} · ${formatSize(viewSize)}`;
                  })()}
              {uploading && ` · Uploading ${uploadProgress}%`}
            </span>
            <div className="flex items-center gap-2.5">
              {!isTrashView && (
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="sort-pill bg-drive-surface border border-drive-border rounded-[10px] py-2.5 px-3 text-drive-text text-[13px] font-medium"
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="name">Name (A-Z)</option>
                  <option value="largest">Largest first</option>
                </select>
              )}
              <div className="flex border border-drive-border rounded-[10px] overflow-hidden">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`view-toggle-btn border-none py-2.5 px-3.5 text-sm cursor-pointer ${viewMode === 'grid' ? 'bg-chip-teal text-teal-700' : 'bg-transparent text-drive-muted'}`}
                  title="Grid view"
                >
                  ▦
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`view-toggle-btn border-none py-2.5 px-3.5 text-sm cursor-pointer ${viewMode === 'list' ? 'bg-chip-teal text-teal-700' : 'bg-transparent text-drive-muted'}`}
                  title="List view"
                >
                  ☰
                </button>
              </div>
            </div>
          </div>

          {!isTrashView && selectedIds.size > 0 && (
            <div className="flex items-center justify-between bg-chip-teal border border-[#E4D3FA] rounded-[14px] py-3 px-4.5 mb-4">
              <span className="text-[13px] font-bold text-teal-700">{selectedIds.size} selected</span>
              <div className="flex gap-3.5 items-center">
                <span className="bulk-bar-clear text-[13px] text-teal-700 cursor-pointer font-semibold" onClick={clearSelection}>
                  Clear
                </span>
                <button onClick={bulkDelete} disabled={bulkDeleting} className="bg-red-500 text-white border-none rounded-[10px] py-2 px-4 text-[13px] font-bold cursor-pointer">
                  {bulkDeleting ? 'Deleting…' : 'Delete selected'}
                </button>
              </div>
            </div>
          )}

          {uploading && (
            <div className="w-full h-[5px] bg-drive-border rounded overflow-hidden mb-4">
              <div className="h-full bg-drive-gradient transition-[width] duration-200 ease-linear" style={{ width: `${uploadProgress}%` }} />
            </div>
          )}

          {loadingFiles ? (
            viewMode === 'grid' ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-[18px]">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="skeleton h-[166px] w-full" />
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="skeleton h-[58px] w-full rounded-xl" />
                ))}
              </div>
            )
          ) : nothingToShow ? (
            <div className="text-center py-[90px] px-5 border-[1.5px] border-dashed border-drive-border rounded-[20px]">
              <div className="text-[42px] mb-3 w-[84px] h-[84px] rounded-full bg-chip-teal flex items-center justify-center mx-auto">
                {isTrashView ? '🗑️' : activeNav === 'starred' ? '⭐' : activeNav === 'recent' ? '🕒' : searchTerm ? '🔎' : '🗂️'}
              </div>
              <p className="font-heading text-drive-text mb-1 text-base font-bold">
                {isTrashView
                  ? 'Trash is empty'
                  : activeNav === 'starred'
                    ? 'No starred files yet'
                    : activeNav === 'recent'
                      ? 'No recent files'
                      : searchTerm
                        ? 'No files match your search'
                        : 'No files yet'}
              </p>
              <p className="text-drive-muted text-[13px]">
                {isTrashView
                  ? 'Deleted files show up here and can be restored.'
                  : activeNav === 'starred'
                    ? 'Click the ☆ on any file to pin it here.'
                    : activeNav === 'recent'
                      ? 'Files you upload will appear here automatically.'
                      : searchTerm
                        ? 'Try a different search term.'
                        : 'Drag and drop files or a folder here, or click "New upload" / "Upload folder" to get started.'}
              </p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-[18px]">
              {visibleFolders.map((folder) => (
                <div
                  key={`folder-${folder.id}`}
                  className="file-tile fade-in bg-drive-surface border border-drive-border rounded-2xl overflow-hidden flex flex-col relative"
                  onClick={() => !isTrashView && openFolder(folder)}
                >
                  <div className={`h-[112px] flex items-center justify-center cursor-pointer ${isTrashView ? 'bg-pink-100' : 'bg-chip-teal'}`}>
                    <span className="text-[38px]">📁</span>
                  </div>
                  <div className="p-3 px-3.5">
                    {renamingFolderId === folder.id ? (
                      <input
                        autoFocus
                        value={renameFolderValue}
                        onChange={(e) => setRenameFolderValue(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onBlur={() => saveRenameFolder(folder.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveRenameFolder(folder.id);
                          if (e.key === 'Escape') setRenamingFolderId(null);
                        }}
                        className="w-full bg-chip-teal border border-teal-500 rounded-lg py-1.5 px-2.5 text-drive-text text-[13px] font-semibold"
                      />
                    ) : (
                      <span className="text-drive-text no-underline text-[13px] font-semibold block whitespace-nowrap overflow-hidden text-ellipsis" title={folder.name}>{folder.name}</span>
                    )}
                    <div className="text-drive-muted text-[11px] mt-1">Folder</div>
                  </div>
                  <div className="absolute top-2 right-2 flex gap-1">
                    {isTrashView ? (
                      <>
                        <button onClick={(e) => { e.stopPropagation(); restoreFolder(folder.id); }} className="restore-btn bg-[rgba(30,27,46,0.55)] text-white border-none rounded-lg py-1.5 px-1.5 text-xs cursor-pointer" title="Restore">
                          ♻️
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); permanentlyDeleteFolder(folder.id); }} className="delete-btn bg-[rgba(30,27,46,0.55)] text-white border-none rounded-lg py-1.5 px-1.5 text-xs cursor-pointer" title="Delete forever">
                          ❌
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={(e) => { e.stopPropagation(); toggleFolderStar(folder); }} className="star-btn bg-[rgba(30,27,46,0.55)] text-white border-none rounded-lg py-1.5 px-1.5 text-xs cursor-pointer" title={folder.starred ? 'Unstar' : 'Star'}>
                          {folder.starred ? '⭐' : '☆'}
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); startRenameFolder(folder); }} className="rename-btn bg-[rgba(30,27,46,0.55)] text-white border-none rounded-lg py-1.5 px-1.5 text-xs cursor-pointer" title="Rename">
                          ✏️
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); trashFolder(folder.id); }} className="delete-btn bg-[rgba(30,27,46,0.55)] text-white border-none rounded-lg py-1.5 px-1.5 text-xs cursor-pointer" title="Delete">
                          🗑️
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}

              {visibleFiles.map((file) => {
                const meta = getFileMeta(file.name);
                const selected = selectedIds.has(file.id);
                return (
                  <div
                    key={file.id}
                    className={`file-tile fade-in bg-drive-surface border rounded-2xl overflow-hidden flex flex-col relative ${
                      selected ? 'selected border-teal-500 shadow-[0_0_0_3px_rgba(13,148,136,0.15)]' : 'border-drive-border'
                    }`}
                  >
                    {!isTrashView && (
                      <div
                        className={`select-check absolute top-2.5 left-2.5 w-[22px] h-[22px] rounded-[7px] border-2 border-white z-[5] flex items-center justify-center text-xs font-extrabold text-white cursor-pointer ${
                          selected ? 'checked bg-teal-600 border-teal-600' : 'bg-white/75'
                        }`}
                        onClick={(e) => { e.stopPropagation(); toggleSelect(file.id); }}
                      >
                        {selected ? '✓' : ''}
                      </div>
                    )}
                    <div
                      className={`h-[112px] flex items-center justify-center cursor-pointer ${meta.bg}`}
                      onClick={() => !isTrashView && setPreviewFile(file)}
                    >
                      {isImage(file.name) && file.url ? (
                        <img src={file.url} alt={file.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-[38px]">{meta.emoji}</span>
                      )}
                    </div>
                    <div className="p-3 px-3.5">
                      {renamingId === file.id ? (
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onBlur={() => saveRename(file.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveRename(file.id);
                            if (e.key === 'Escape') setRenamingId(null);
                          }}
                          className="w-full bg-chip-teal border border-teal-500 rounded-lg py-1.5 px-2.5 text-drive-text text-[13px] font-semibold"
                        />
                      ) : (
                        <a
                          href={file.url || undefined}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-drive-text no-underline text-[13px] font-semibold block whitespace-nowrap overflow-hidden text-ellipsis"
                          title={file.name}
                        >
                          {file.name}
                        </a>
                      )}
                      <div className="text-drive-muted text-[11px] mt-1">{formatSize(file.size)}</div>
                    </div>
                    <div className="absolute top-2 right-2 flex gap-1">
                      {isTrashView ? (
                        <>
                          <button onClick={() => restoreFile(file.id)} className="restore-btn bg-[rgba(30,27,46,0.55)] text-white border-none rounded-lg py-1.5 px-1.5 text-xs cursor-pointer" title="Restore">
                            ♻️
                          </button>
                          <button onClick={() => permanentlyDeleteFile(file.id)} className="delete-btn bg-[rgba(30,27,46,0.55)] text-white border-none rounded-lg py-1.5 px-1.5 text-xs cursor-pointer" title="Delete forever">
                            ❌
                          </button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => toggleStar(file)} className="star-btn bg-[rgba(30,27,46,0.55)] text-white border-none rounded-lg py-1.5 px-1.5 text-xs cursor-pointer" title={file.starred ? 'Unstar' : 'Star'}>
                            {file.starred ? '⭐' : '☆'}
                          </button>
                          <button onClick={() => startRename(file)} className="rename-btn bg-[rgba(30,27,46,0.55)] text-white border-none rounded-lg py-1.5 px-1.5 text-xs cursor-pointer" title="Rename">
                            ✏️
                          </button>
                          <button onClick={() => requestDelete(file.id)} className="delete-btn bg-[rgba(30,27,46,0.55)] text-white border-none rounded-lg py-1.5 px-1.5 text-xs cursor-pointer" title="Delete">
                            🗑️
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <div className="flex items-center py-2 px-3.5 text-xs font-semibold text-drive-muted border-b border-drive-border mb-1 gap-3">
                <span className="w-[28px]"></span>
                <span className="flex-1">Name</span>
                <span className="w-[90px]">Size</span>
                <span className="w-[140px]">Modified</span>
                <span className="w-[96px]"></span>
              </div>

              {visibleFolders.map((folder) => (
                <div
                  key={`folder-${folder.id}`}
                  className="file-row fade-in flex items-center py-2.5 px-3.5 rounded-xl gap-3"
                  onClick={() => !isTrashView && openFolder(folder)}
                >
                  <span className="w-5" />
                  <div className={`text-lg w-[34px] h-[34px] flex items-center justify-center flex-none overflow-hidden rounded-[9px] cursor-pointer ${isTrashView ? 'bg-pink-100' : 'bg-chip-teal'}`}>📁</div>
                  <div className="flex-1 min-w-0">
                    {renamingFolderId === folder.id ? (
                      <input
                        autoFocus
                        value={renameFolderValue}
                        onChange={(e) => setRenameFolderValue(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onBlur={() => saveRenameFolder(folder.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveRenameFolder(folder.id);
                          if (e.key === 'Escape') setRenamingFolderId(null);
                        }}
                        className="w-full bg-chip-teal border border-teal-500 rounded-lg py-1.5 px-2.5 text-drive-text text-[13px] font-semibold"
                      />
                    ) : (
                      <span className="text-drive-text no-underline text-sm font-medium block whitespace-nowrap overflow-hidden text-ellipsis">{folder.name}</span>
                    )}
                  </div>
                  <span className="w-[90px] text-[13px] text-drive-muted">—</span>
                  <span className="w-[140px] text-[13px] text-drive-muted">
                    {isTrashView && folder.deleted_at ? new Date(folder.deleted_at).toLocaleDateString() : 'Folder'}
                  </span>
                  <div className="w-[96px] flex gap-1.5 justify-end">
                    {isTrashView ? (
                      <>
                        <button onClick={(e) => { e.stopPropagation(); restoreFolder(folder.id); }} className="restore-btn bg-[rgba(30,27,46,0.55)] text-white border-none rounded-lg py-1.5 px-1.5 text-xs cursor-pointer" title="Restore">
                          ♻️
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); permanentlyDeleteFolder(folder.id); }} className="delete-btn bg-[rgba(30,27,46,0.55)] text-white border-none rounded-lg py-1.5 px-1.5 text-xs cursor-pointer" title="Delete forever">
                          ❌
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={(e) => { e.stopPropagation(); toggleFolderStar(folder); }} className="star-btn bg-[rgba(30,27,46,0.55)] text-white border-none rounded-lg py-1.5 px-1.5 text-xs cursor-pointer" title={folder.starred ? 'Unstar' : 'Star'}>
                          {folder.starred ? '⭐' : '☆'}
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); startRenameFolder(folder); }} className="rename-btn bg-[rgba(30,27,46,0.55)] text-white border-none rounded-lg py-1.5 px-1.5 text-xs cursor-pointer" title="Rename">
                          ✏️
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); trashFolder(folder.id); }} className="delete-btn bg-[rgba(30,27,46,0.55)] text-white border-none rounded-lg py-1.5 px-1.5 text-xs cursor-pointer" title="Delete">
                          🗑️
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}

              {visibleFiles.map((file) => {
                const meta = getFileMeta(file.name);
                const selected = selectedIds.has(file.id);
                return (
                  <div
                    key={file.id}
                    className={`file-row fade-in flex items-center py-2.5 px-3.5 rounded-xl gap-3 ${selected ? 'selected' : ''}`}
                  >
                    {isTrashView ? (
                      <span className="w-5" />
                    ) : (
                      <div
                        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center text-[11px] font-extrabold text-white cursor-pointer flex-none ${
                          selected ? 'checked bg-teal-600 border-teal-600' : 'border-drive-border'
                        }`}
                        onClick={() => toggleSelect(file.id)}
                      >
                        {selected ? '✓' : ''}
                      </div>
                    )}
                    <div
                      className={`text-lg w-[34px] h-[34px] flex items-center justify-center flex-none overflow-hidden rounded-[9px] cursor-pointer ${meta.bg}`}
                      onClick={() => !isTrashView && setPreviewFile(file)}
                    >
                      {isImage(file.name) && file.url ? (
                        <img src={file.url} alt={file.name} className="w-full h-full object-cover" />
                      ) : (
                        <span>{meta.emoji}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      {renamingId === file.id ? (
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onBlur={() => saveRename(file.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveRename(file.id);
                            if (e.key === 'Escape') setRenamingId(null);
                          }}
                          className="w-full bg-chip-teal border border-teal-500 rounded-lg py-1.5 px-2.5 text-drive-text text-[13px] font-semibold"
                        />
                      ) : (
                        <a href={file.url || undefined} target="_blank" rel="noopener noreferrer" className="text-drive-text no-underline text-sm font-medium block whitespace-nowrap overflow-hidden text-ellipsis">
                          {file.name}
                        </a>
                      )}
                    </div>
                    <span className="w-[90px] text-[13px] text-drive-muted">{formatSize(file.size)}</span>
                    <span className="w-[140px] text-[13px] text-drive-muted">
                      {new Date(isTrashView ? file.deleted_at : file.created_at).toLocaleDateString()}
                    </span>
                    <div className="w-[96px] flex gap-1.5 justify-end">
                      {isTrashView ? (
                        <>
                          <button onClick={() => restoreFile(file.id)} className="restore-btn bg-[rgba(30,27,46,0.55)] text-white border-none rounded-lg py-1.5 px-1.5 text-xs cursor-pointer" title="Restore">
                            ♻️
                          </button>
                          <button onClick={() => permanentlyDeleteFile(file.id)} className="delete-btn bg-[rgba(30,27,46,0.55)] text-white border-none rounded-lg py-1.5 px-1.5 text-xs cursor-pointer" title="Delete forever">
                            ❌
                          </button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => toggleStar(file)} className="star-btn bg-[rgba(30,27,46,0.55)] text-white border-none rounded-lg py-1.5 px-1.5 text-xs cursor-pointer" title={file.starred ? 'Unstar' : 'Star'}>
                            {file.starred ? '⭐' : '☆'}
                          </button>
                          <button onClick={() => startRename(file)} className="rename-btn bg-[rgba(30,27,46,0.55)] text-white border-none rounded-lg py-1.5 px-1.5 text-xs cursor-pointer" title="Rename">
                            ✏️
                          </button>
                          <button onClick={() => requestDelete(file.id)} className="delete-btn bg-[rgba(30,27,46,0.55)] text-white border-none rounded-lg py-1.5 px-1.5 text-xs cursor-pointer" title="Delete">
                            🗑️
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;