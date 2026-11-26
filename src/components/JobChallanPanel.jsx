import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Plus,
  Search,
  Printer,
  Download,
  Edit2,
  Trash2,
  X,
  FileText,
  CheckCircle2,
  Clock,
  Layers,
  Image as ImageIcon,
  MessageCircle,
  Eye,
  RefreshCw,
  Scissors,
  AlertCircle,
  Save,
} from 'lucide-react';
import { api } from '../services/api';
import { getCompanyById } from '../config/companiesConfig';
import { convertDriveUrl } from '../utils/imageUrlHelper';

const PROCESS_PRESETS = [
  'Stitching',
  'Embroidery',
  'Handwork',
  'Finishing',
  'Washing',
  'Packing',
  'Printing',
  'Dyeing',
  'Other',
];

const UNIT_OPTIONS = ['Pcs', 'Mtrs', 'Sets', 'Kg', 'Roll'];

const STATUS_STYLES = {
  DRAFT: { bg: '#f1f5f9', color: '#475569', border: '#cbd5e1', label: 'DRAFT' },
  ISSUED: { bg: '#dbeafe', color: '#1d4ed8', border: '#93c5fd', label: 'ISSUED' },
  PARTIAL_RECEIVED: { bg: '#fef3c7', color: '#b45309', border: '#fcd34d', label: 'PARTIAL' },
  COMPLETED: { bg: '#d1fae5', color: '#047857', border: '#6ee7b7', label: 'COMPLETED' },
  CANCELLED: { bg: '#fee2e2', color: '#b91c1c', border: '#fca5a5', label: 'CANCELLED' },
};

const createEmptyItem = (defaultProcess = 'Stitching') => ({
  designNo: '',
  designImageUrl: '',
  description: '',
  processType: defaultProcess,
  sizeRatio: '',
  qty: 1,
  receivedQty: 0,
  unit: 'Pcs',
  rate: 0,
  remarks: '',
});

const fmtDate = (dStr) => {
  if (!dStr) return '—';
  const d = new Date(dStr);
  if (Number.isNaN(d.getTime())) return dStr;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const getTodayYmd = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export default function JobChallanPanel({ companyId = 'stitching', currentUser = null }) {
  const company = useMemo(() => getCompanyById(companyId), [companyId]);
  const brandColor = company?.badgeColor || '#10b981';
  const brandGradient = company?.gradient || `linear-gradient(135deg, ${brandColor}, ${brandColor})`;

  // List state
  const [challans, setChallans] = useState([]);
  const [stats, setStats] = useState({ totalChallans: 0, activeCount: 0, completedCount: 0, totalQty: 0, totalDesigns: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [partiesList, setPartiesList] = useState([]);

  // Modals
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingChallan, setEditingChallan] = useState(null);
  const [previewChallan, setPreviewChallan] = useState(null);
  const [zoomImage, setZoomImage] = useState(null);

  // Form state
  const [form, setForm] = useState({
    challanNo: '',
    challanDate: getTodayYmd(),
    expectedReturnDate: '',
    challanType: 'ISSUE',
    status: 'ISSUED',
    party: { name: '', phone: '', address: '', gstin: '' },
    processType: company?.id === 'digital_print' ? 'Printing' : 'Stitching',
    refLotNo: '',
    items: [createEmptyItem(company?.id === 'digital_print' ? 'Printing' : 'Stitching')],
    showRateInPrint: false,
    notes: '',
    terms: 'Goods sent for job work only (Not for Sale). Return balance fabric and rejected pieces along with finished goods.',
  });

  const [saving, setSaving] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);
  const [toast, setToast] = useState(null);
  const [designSuggestions, setDesignSuggestions] = useState({}); // rowIdx -> suggestions[]
  const [activeSuggestRow, setActiveSuggestRow] = useState(null);
  const lookupTimersRef = useRef({});

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3800);
  }, []);

  const fetchChallans = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getJobChallans({
        companyEntity: company.id,
        status: statusFilter,
        challanType: typeFilter,
        search,
      });
      if (res && res.success) {
        setChallans(res.data || []);
        if (res.stats) setStats(res.stats);
      }
    } catch (err) {
      showToast('Failed to load Job Challans: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [company.id, statusFilter, typeFilter, search, showToast]);

  useEffect(() => {
    fetchChallans();
  }, [fetchChallans]);

  // Load known parties/vendors for quick autocomplete
  useEffect(() => {
    let active = true;
    const loadParties = async () => {
      try {
        const [pRes, vRes] = await Promise.allSettled([
          api.getParties ? api.getParties() : Promise.resolve([]),
          api.getVendors ? api.getVendors() : Promise.resolve([]),
        ]);
        if (!active) return;
        const merged = [];
        const seen = new Set();
        const pushList = (raw) => {
          const arr = Array.isArray(raw) ? raw : raw?.data || raw?.parties || [];
          arr.forEach((p) => {
            const name = String(p.businessName || p.name || p.partyName || '').trim();
            if (name && !seen.has(name.toLowerCase())) {
              seen.add(name.toLowerCase());
              merged.push({
                name,
                phone: p.phone || p.mobile || p.contactNo || '',
                address: p.address || p.billingAddress || '',
                gstin: p.gstin || p.gstNo || '',
              });
            }
          });
        };
        if (pRes.status === 'fulfilled') pushList(pRes.value);
        if (vRes.status === 'fulfilled') pushList(vRes.value);
        setPartiesList(merged);
      } catch (_) {}
    };
    loadParties();
    return () => {
      active = false;
    };
  }, [company.id]);

  // Escape key closes modals cleanly
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (zoomImage) setZoomImage(null);
        else if (previewChallan) setPreviewChallan(null);
        else if (showFormModal) setShowFormModal(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [zoomImage, previewChallan, showFormModal]);

  const openCreateModal = async () => {
    const defaultProc = company.id === 'digital_print' ? 'Printing' : 'Stitching';
    setEditingChallan(null);
    setDesignSuggestions({});
    setActiveSuggestRow(null);
    setForm({
      challanNo: '',
      challanDate: getTodayYmd(),
      expectedReturnDate: '',
      challanType: 'ISSUE',
      status: 'ISSUED',
      party: { name: '', phone: '', address: '', gstin: '' },
      processType: defaultProc,
      refLotNo: '',
      items: [createEmptyItem(defaultProc)],
      showRateInPrint: false,
      notes: '',
      terms: 'Goods sent for job work only (Not for Sale). Return balance fabric and rejected pieces along with finished goods.',
    });
    setShowFormModal(true);

    try {
      const res = await api.getNextJobChallanNumber(company.id);
      if (res && res.nextChallanNo) {
        setForm((prev) => ({ ...prev, challanNo: res.nextChallanNo }));
      }
    } catch (_) {}
  };

  const openEditModal = (challan) => {
    setEditingChallan(challan);
    setDesignSuggestions({});
    setActiveSuggestRow(null);
    setForm({
      challanNo: challan.challanNo || '',
      challanDate: challan.challanDate || getTodayYmd(),
      expectedReturnDate: challan.expectedReturnDate || '',
      challanType: challan.challanType || 'ISSUE',
      status: challan.status || 'ISSUED',
      party: {
        name: challan.party?.name || '',
        phone: challan.party?.phone || '',
        address: challan.party?.address || '',
        gstin: challan.party?.gstin || '',
      },
      processType: challan.processType || 'Stitching',
      refLotNo: challan.refLotNo || '',
      items:
        Array.isArray(challan.items) && challan.items.length > 0
          ? challan.items.map((it) => ({
              designNo: it.designNo || '',
              designImageUrl: it.designImageUrl || '',
              description: it.description || '',
              processType: it.processType || challan.processType || 'Stitching',
              sizeRatio: it.sizeRatio || '',
              qty: Number(it.qty) || 0,
              receivedQty: Number(it.receivedQty) || 0,
              unit: it.unit || 'Pcs',
              rate: Number(it.rate) || 0,
              remarks: it.remarks || '',
            }))
          : [createEmptyItem(challan.processType || 'Stitching')],
      showRateInPrint: Boolean(challan.showRateInPrint),
      notes: challan.notes || '',
      terms:
        challan.terms ||
        'Goods sent for job work only (Not for Sale). Return balance fabric and rejected pieces along with finished goods.',
    });
    setPreviewChallan(null);
    setShowFormModal(true);
  };

  // Party selection auto-fills phone/address/gstin if matched
  const handlePartyNameChange = (val) => {
    const match = partiesList.find((p) => p.name.toLowerCase() === String(val || '').trim().toLowerCase());
    setForm((prev) => ({
      ...prev,
      party: {
        ...prev.party,
        name: val,
        phone: match && !prev.party.phone ? match.phone : prev.party.phone,
        address: match && !prev.party.address ? match.address : prev.party.address,
        gstin: match && !prev.party.gstin ? match.gstin : prev.party.gstin,
      },
    }));
  };

  // Design Number input + debounced image/details auto-lookup
  const handleItemChange = (idx, field, val) => {
    setForm((prev) => {
      const updated = [...prev.items];
      updated[idx] = { ...updated[idx], [field]: val };
      return { ...prev, items: updated };
    });

    if (field === 'designNo') {
      const query = String(val || '').trim();
      if (lookupTimersRef.current[idx]) clearTimeout(lookupTimersRef.current[idx]);
      if (!query) {
        setDesignSuggestions((prev) => ({ ...prev, [idx]: [] }));
        return;
      }
      setActiveSuggestRow(idx);
      lookupTimersRef.current[idx] = setTimeout(async () => {
        try {
          const res = await api.lookupJobChallanDesign(query);
          if (res && res.success) {
            setDesignSuggestions((prev) => ({ ...prev, [idx]: res.suggestions || [] }));
            // Auto-fill image & description immediately on exact match!
            if (res.exact) {
              setForm((prev) => {
                const updated = [...prev.items];
                if (!updated[idx]) return prev;
                if (String(updated[idx].designNo || '').trim().toLowerCase() === query.toLowerCase()) {
                  updated[idx] = {
                    ...updated[idx],
                    designImageUrl: res.exact.imageUrl || updated[idx].designImageUrl,
                    description: updated[idx].description || res.exact.description || '',
                  };
                }
                return { ...prev, items: updated };
              });
            }
          }
        } catch (_) {}
      }, 260);
    }
  };

  const handleSelectDesignSuggestion = (idx, sug) => {
    setForm((prev) => {
      const updated = [...prev.items];
      if (!updated[idx]) return prev;
      updated[idx] = {
        ...updated[idx],
        designNo: sug.designNo,
        designImageUrl: sug.imageUrl || updated[idx].designImageUrl,
        description: sug.description || updated[idx].description,
      };
      return { ...prev, items: updated };
    });
    setActiveSuggestRow(null);
    setDesignSuggestions((prev) => ({ ...prev, [idx]: [] }));
  };

  const handleAddRow = () => {
    setForm((prev) => ({
      ...prev,
      items: [...prev.items, createEmptyItem(prev.processType || 'Stitching')],
    }));
  };

  const handleRemoveRow = (idx) => {
    setForm((prev) => {
      const next = prev.items.filter((_, i) => i !== idx);
      return { ...prev, items: next.length > 0 ? next : [createEmptyItem(prev.processType)] };
    });
  };

  const formSummary = useMemo(() => {
    const valid = form.items.filter((i) => i.designNo && i.designNo.trim());
    const totalQty = valid.reduce((s, i) => s + (Number(i.qty) || 0), 0);
    const totalValue = valid.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.rate) || 0), 0);
    return { totalDesigns: valid.length, totalQty, totalValue };
  }, [form.items]);

  const handleSave = async (statusOverride = null, openPreviewAfter = false) => {
    if (!form.party.name || !form.party.name.trim()) {
      showToast('Please enter Party / Karigar name.', 'error');
      return;
    }
    const validItems = form.items.filter((i) => i.designNo && i.designNo.trim());
    if (validItems.length === 0) {
      showToast('Please enter at least one Design Number.', 'error');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        companyEntity: company.id,
        status: statusOverride || form.status || 'ISSUED',
        items: validItems.map((it) => ({
          ...it,
          qty: Number(it.qty) || 0,
          rate: Number(it.rate) || 0,
          processType: it.processType || form.processType,
        })),
        createdBy: currentUser?.name || currentUser?.email || '',
      };

      const res = editingChallan
        ? await api.updateJobChallan(editingChallan._id, payload)
        : await api.createJobChallan(payload);

      if (res && res.success) {
        showToast(res.message || 'Job Challan saved successfully!');
        setShowFormModal(false);
        await fetchChallans();
        if (openPreviewAfter && res.data) {
          setPreviewChallan(res.data);
        }
      } else {
        showToast(res?.message || 'Failed to save Job Challan.', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Failed to save Job Challan.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (challan) => {
    if (!window.confirm(`Delete Job Challan ${challan.challanNo}?`)) return;
    try {
      const res = await api.deleteJobChallan(challan._id);
      if (res && res.success) {
        showToast(`Deleted ${challan.challanNo}`);
        if (previewChallan?._id === challan._id) setPreviewChallan(null);
        fetchChallans();
      }
    } catch (err) {
      showToast('Delete failed: ' + err.message, 'error');
    }
  };

  const handleStatusChange = async (challan, newStatus) => {
    try {
      const res = await api.updateJobChallanStatus(challan._id, newStatus);
      if (res && res.success) {
        showToast(`${challan.challanNo} marked as ${newStatus}`);
        if (previewChallan?._id === challan._id) setPreviewChallan(res.data);
        fetchChallans();
      }
    } catch (err) {
      showToast('Status update failed: ' + err.message, 'error');
    }
  };

  const handleDownloadPdf = async (challan) => {
    setDownloadingId(challan._id);
    try {
      await api.downloadJobChallanPdf(challan._id, challan.challanNo);
      showToast(`Downloaded ${challan.challanNo}.pdf`);
    } catch (err) {
      showToast('PDF download failed: ' + err.message, 'error');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleWhatsAppShare = (challan) => {
    const lines = [
      `*${company.name.toUpperCase()} — JOB CHALLAN*`,
      `Challan No: *${challan.challanNo}*`,
      `Date: ${fmtDate(challan.challanDate)}${challan.expectedReturnDate ? ` | Due: ${fmtDate(challan.expectedReturnDate)}` : ''}`,
      `Party: *${challan.party?.name || '—'}*`,
      `Process: ${challan.processType || '—'}${challan.refLotNo ? ` | Lot: ${challan.refLotNo}` : ''}`,
      '',
      '*Designs:*',
      ...(challan.items || []).map(
        (it, idx) =>
          `${idx + 1}. *${it.designNo}*${it.description ? ` — ${it.description}` : ''} | Qty: *${it.qty} ${it.unit || 'Pcs'}*${it.sizeRatio ? ` (${it.sizeRatio})` : ''}`
      ),
      '',
      `*Total: ${challan.totalDesigns || challan.items?.length || 0} Designs | ${challan.totalQty || 0} ${challan.items?.[0]?.unit || 'Pcs'}*`,
    ];
    const text = encodeURIComponent(lines.join('\n'));
    const phoneClean = String(challan.party?.phone || '').replace(/\D/g, '');
    const waUrl = phoneClean.length >= 10
      ? `https://wa.me/${phoneClean.length === 10 ? `91${phoneClean}` : phoneClean}?text=${text}`
      : `https://wa.me/?text=${text}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  const handleBrowserPrint = () => {
    window.print();
  };

  return (
    <div style={{ padding: '1rem 1.25rem', maxWidth: '1440px', margin: '0 auto', color: '#0f172a' }}>
      {/* Toast Notification */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: '1.25rem',
            right: '1.25rem',
            zIndex: 100001,
            background: toast.type === 'error' ? '#dc2626' : '#0f172a',
            color: '#ffffff',
            padding: '0.75rem 1.1rem',
            borderRadius: '10px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
            fontSize: '0.84rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          {toast.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} color="#34d399" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* ── Branded Company Header ── */}
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderTop: `4px solid ${brandColor}`,
          borderRadius: '14px',
          padding: '1rem 1.25rem',
          marginBottom: '1rem',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          boxShadow: '0 2px 8px rgba(15,23,42,0.04)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: '11px',
              background: brandGradient,
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 900,
              fontSize: '0.95rem',
              letterSpacing: '0.03em',
              boxShadow: `0 4px 12px ${brandColor}40`,
            }}
          >
            {company.code}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>
                Job Challan
              </h2>
              <span
                style={{
                  background: `${brandColor}18`,
                  color: brandColor,
                  border: `1px solid ${brandColor}44`,
                  padding: '2px 9px',
                  borderRadius: '999px',
                  fontSize: '0.72rem',
                  fontWeight: 800,
                }}
              >
                {company.name}
              </span>
            </div>
            <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#64748b' }}>
              Issue &amp; receive job work challans with Design Numbers, automatic design images &amp; branded PDF export.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={fetchChallans}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.55rem 0.9rem',
              borderRadius: '9px',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#334155',
              fontWeight: 700,
              fontSize: '0.82rem',
              cursor: 'pointer',
            }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.6rem 1.1rem',
              borderRadius: '9px',
              border: 'none',
              background: brandGradient,
              color: '#ffffff',
              fontWeight: 800,
              fontSize: '0.84rem',
              cursor: 'pointer',
              boxShadow: `0 4px 12px ${brandColor}40`,
            }}
          >
            <Plus size={16} />
            Create Job Challan
          </button>
        </div>
      </div>

      {/* ── KPI Summary Row ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '0.75rem',
          marginBottom: '1rem',
        }}
      >
        {[
          { label: 'Total Challans', value: stats.totalChallans, icon: FileText, color: brandColor },
          { label: 'Active / Issued', value: stats.activeCount, icon: Clock, color: '#2563eb' },
          { label: 'Completed', value: stats.completedCount, icon: CheckCircle2, color: '#059669' },
          { label: 'Total Qty Dispatched', value: stats.totalQty.toLocaleString('en-IN'), icon: Layers, color: '#7c3aed' },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '0.85rem 1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ fontSize: '0.73rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                  {card.label}
                </div>
                <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#0f172a', marginTop: '2px' }}>
                  {card.value}
                </div>
              </div>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: '10px',
                  background: `${card.color}16`,
                  color: card.color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon size={18} />
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Search & Filters ── */}
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          padding: '0.75rem 1rem',
          marginBottom: '1rem',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.65rem',
          alignItems: 'center',
        }}
      >
        <div style={{ position: 'relative', flex: '1 1 260px' }}>
          <Search size={15} color="#64748b" style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Challan No, Design No, Party, Lot No..."
            style={{
              width: '100%',
              padding: '0.52rem 0.75rem 0.52rem 2.25rem',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              fontSize: '0.84rem',
              boxSizing: 'border-box',
            }}
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          style={{ padding: '0.52rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', fontWeight: 600 }}
        >
          <option value="ALL">All Types</option>
          <option value="ISSUE">Job Work Issue</option>
          <option value="RECEIVE">Job Work Receive</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ padding: '0.52rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', fontWeight: 600 }}
        >
          <option value="ALL">All Statuses</option>
          <option value="ISSUED">Issued</option>
          <option value="PARTIAL_RECEIVED">Partial Received</option>
          <option value="COMPLETED">Completed</option>
          <option value="DRAFT">Draft</option>
        </select>
      </div>

      {/* ── Challans Table ── */}
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '14px',
          overflow: 'hidden',
        }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                <th style={{ padding: '0.75rem 0.9rem', fontWeight: 800 }}>Challan No</th>
                <th style={{ padding: '0.75rem 0.9rem', fontWeight: 800 }}>Date / Due</th>
                <th style={{ padding: '0.75rem 0.9rem', fontWeight: 800 }}>Party / Karigar</th>
                <th style={{ padding: '0.75rem 0.9rem', fontWeight: 800 }}>Designs &amp; Images</th>
                <th style={{ padding: '0.75rem 0.9rem', fontWeight: 800 }}>Process</th>
                <th style={{ padding: '0.75rem 0.9rem', fontWeight: 800, textAlign: 'right' }}>Total Qty</th>
                <th style={{ padding: '0.75rem 0.9rem', fontWeight: 800 }}>Status</th>
                <th style={{ padding: '0.75rem 0.9rem', fontWeight: 800, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ padding: '2.5rem', textAlign: 'center', color: '#64748b' }}>
                    Loading Job Challans for {company.name}...
                  </td>
                </tr>
              ) : challans.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '3rem 1rem', textAlign: 'center', color: '#64748b' }}>
                    <FileText size={32} color="#cbd5e1" style={{ marginBottom: '0.5rem' }} />
                    <div style={{ fontWeight: 700, color: '#334155', marginBottom: '0.25rem' }}>
                      No Job Challans yet for {company.name}
                    </div>
                    <div style={{ fontSize: '0.8rem', marginBottom: '0.9rem' }}>
                      Click &quot;Create Job Challan&quot; to issue your first job work challan with Design Numbers &amp; images.
                    </div>
                    <button
                      type="button"
                      onClick={openCreateModal}
                      style={{
                        padding: '0.55rem 1rem',
                        borderRadius: '8px',
                        border: 'none',
                        background: brandColor,
                        color: '#ffffff',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      + Create Job Challan
                    </button>
                  </td>
                </tr>
              ) : (
                challans.map((c) => {
                  const st = STATUS_STYLES[c.status] || STATUS_STYLES.ISSUED;
                  const items = c.items || [];
                  return (
                    <tr key={c._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.75rem 0.9rem', fontWeight: 800, color: brandColor }}>
                        <div>{c.challanNo}</div>
                        <span
                          style={{
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            color: c.challanType === 'RECEIVE' ? '#047857' : '#475569',
                            background: c.challanType === 'RECEIVE' ? '#ecfdf5' : '#f1f5f9',
                            padding: '1px 6px',
                            borderRadius: '4px',
                          }}
                        >
                          {c.challanType === 'RECEIVE' ? 'RECEIVE' : 'ISSUE'}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 0.9rem', whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 700 }}>{fmtDate(c.challanDate)}</div>
                        {c.expectedReturnDate && (
                          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Due: {fmtDate(c.expectedReturnDate)}</div>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem 0.9rem' }}>
                        <div style={{ fontWeight: 700, color: '#0f172a' }}>{c.party?.name || '—'}</div>
                        {c.party?.phone && <div style={{ fontSize: '0.73rem', color: '#64748b' }}>{c.party.phone}</div>}
                      </td>
                      <td style={{ padding: '0.75rem 0.9rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                          {items.slice(0, 3).map((it, idx) => (
                            <div
                              key={idx}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                background: '#f8fafc',
                                border: '1px solid #e2e8f0',
                                borderRadius: '6px',
                                padding: '2px 6px 2px 3px',
                              }}
                            >
                              {it.designImageUrl ? (
                                <img
                                  src={convertDriveUrl(it.designImageUrl)}
                                  alt={it.designNo}
                                  onClick={() => setZoomImage({ url: convertDriveUrl(it.designImageUrl), title: it.designNo })}
                                  style={{ width: 24, height: 24, objectFit: 'cover', borderRadius: '4px', cursor: 'pointer' }}
                                />
                              ) : (
                                <div
                                  style={{
                                    width: 24,
                                    height: 24,
                                    borderRadius: '4px',
                                    background: '#e2e8f0',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: '#94a3b8',
                                  }}
                                >
                                  <ImageIcon size={12} />
                                </div>
                              )}
                              <span style={{ fontWeight: 700, fontSize: '0.76rem', color: '#0f172a' }}>{it.designNo}</span>
                            </div>
                          ))}
                          {items.length > 3 && (
                            <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748b' }}>
                              +{items.length - 3} more
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem 0.9rem' }}>
                        <span style={{ fontWeight: 600, color: '#334155' }}>{c.processType || '—'}</span>
                        {c.refLotNo && <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Lot: {c.refLotNo}</div>}
                      </td>
                      <td style={{ padding: '0.75rem 0.9rem', textAlign: 'right', fontWeight: 800 }}>
                        {c.totalQty || 0} <span style={{ fontSize: '0.74rem', fontWeight: 600, color: '#64748b' }}>{items[0]?.unit || 'Pcs'}</span>
                      </td>
                      <td style={{ padding: '0.75rem 0.9rem' }}>
                        <select
                          value={c.status}
                          onChange={(e) => handleStatusChange(c, e.target.value)}
                          style={{
                            background: st.bg,
                            color: st.color,
                            border: `1px solid ${st.border}`,
                            borderRadius: '999px',
                            padding: '3px 8px',
                            fontSize: '0.72rem',
                            fontWeight: 800,
                            cursor: 'pointer',
                          }}
                        >
                          <option value="DRAFT">DRAFT</option>
                          <option value="ISSUED">ISSUED</option>
                          <option value="PARTIAL_RECEIVED">PARTIAL</option>
                          <option value="COMPLETED">COMPLETED</option>
                          <option value="CANCELLED">CANCELLED</option>
                        </select>
                      </td>
                      <td style={{ padding: '0.75rem 0.9rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', gap: '0.35rem' }}>
                          <button
                            type="button"
                            onClick={() => setPreviewChallan(c)}
                            title="View & Print Challan"
                            style={{ padding: '5px 8px', borderRadius: '7px', border: '1px solid #cbd5e1', background: '#ffffff', color: '#334155', cursor: 'pointer' }}
                          >
                            <Eye size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDownloadPdf(c)}
                            disabled={downloadingId === c._id}
                            title="Download Branded PDF with Design Images"
                            style={{ padding: '5px 8px', borderRadius: '7px', border: `1px solid ${brandColor}55`, background: `${brandColor}14`, color: brandColor, cursor: 'pointer' }}
                          >
                            <Download size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleWhatsAppShare(c)}
                            title="Share on WhatsApp"
                            style={{ padding: '5px 8px', borderRadius: '7px', border: '1px solid #86efac', background: '#f0fdf4', color: '#15803d', cursor: 'pointer' }}
                          >
                            <MessageCircle size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(c)}
                            title="Edit Challan"
                            style={{ padding: '5px 8px', borderRadius: '7px', border: '1px solid #cbd5e1', background: '#ffffff', color: '#334155', cursor: 'pointer' }}
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(c)}
                            title="Delete Challan"
                            style={{ padding: '5px 8px', borderRadius: '7px', border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', cursor: 'pointer' }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* CREATE / EDIT JOB CHALLAN FORM MODAL                                   */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {showFormModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(3px)',
            zIndex: 99990,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0.75rem',
          }}
          onClick={() => setShowFormModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '1120px',
              maxHeight: '92vh',
              background: '#ffffff',
              borderRadius: '16px',
              borderTop: `5px solid ${brandColor}`,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 24px 50px rgba(15,23,42,0.28)',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '1rem 1.25rem',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: '#f8fafc',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: '10px',
                    background: brandGradient,
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Scissors size={19} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
                    {editingChallan ? `Edit Job Challan — ${editingChallan.challanNo}` : 'Create Job Challan'}
                  </h3>
                  <p style={{ margin: 0, fontSize: '0.76rem', color: '#64748b' }}>
                    {company.name} — Enter Design Number to auto-attach its design image in Challan &amp; PDF
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowFormModal(false)}
                style={{
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  borderRadius: '8px',
                  width: 34,
                  height: 34,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#475569',
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '1.1rem 1.25rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
              {/* Section 1: Basic Challan Details */}
              <div>
                <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.6rem' }}>
                  Basic Challan Details
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                      Challan No <span style={{ color: brandColor, fontSize: '0.68rem' }}>(Auto-generated)</span>
                    </label>
                    <input
                      type="text"
                      value={form.challanNo}
                      onChange={(e) => setForm((p) => ({ ...p, challanNo: e.target.value }))}
                      placeholder={`${company.code}-JC-2026-0001`}
                      style={{ width: '100%', padding: '0.5rem 0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontWeight: 700, fontSize: '0.84rem', boxSizing: 'border-box', background: '#f8fafc' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                      Challan Date *
                    </label>
                    <input
                      type="date"
                      value={form.challanDate}
                      onChange={(e) => setForm((p) => ({ ...p, challanDate: e.target.value }))}
                      style={{ width: '100%', padding: '0.5rem 0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.84rem', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                      Challan Type
                    </label>
                    <select
                      value={form.challanType}
                      onChange={(e) => setForm((p) => ({ ...p, challanType: e.target.value }))}
                      style={{ width: '100%', padding: '0.5rem 0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.84rem', boxSizing: 'border-box' }}
                    >
                      <option value="ISSUE">Issue to Karigar / Vendor</option>
                      <option value="RECEIVE">Receive from Karigar / Vendor</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                      Expected Return Date
                    </label>
                    <input
                      type="date"
                      value={form.expectedReturnDate}
                      onChange={(e) => setForm((p) => ({ ...p, expectedReturnDate: e.target.value }))}
                      style={{ width: '100%', padding: '0.5rem 0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.84rem', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                {/* Party & Process Row */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', marginTop: '0.75rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                      Party / Karigar / Vendor Name *
                    </label>
                    <input
                      type="text"
                      list="job-challan-parties-datalist"
                      value={form.party.name}
                      onChange={(e) => handlePartyNameChange(e.target.value)}
                      placeholder="Select or type party / karigar name..."
                      style={{ width: '100%', padding: '0.5rem 0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.84rem', boxSizing: 'border-box' }}
                    />
                    <datalist id="job-challan-parties-datalist">
                      {partiesList.map((p) => (
                        <option key={p.name} value={p.name} />
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                      Party Phone (Optional)
                    </label>
                    <input
                      type="text"
                      value={form.party.phone}
                      onChange={(e) => setForm((p) => ({ ...p, party: { ...p.party, phone: e.target.value } }))}
                      placeholder="+91 98250 12345"
                      style={{ width: '100%', padding: '0.5rem 0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.84rem', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                      Party Address / GSTIN (Optional)
                    </label>
                    <input
                      type="text"
                      value={form.party.address}
                      onChange={(e) => setForm((p) => ({ ...p, party: { ...p.party, address: e.target.value } }))}
                      placeholder="Market / Area, Surat"
                      style={{ width: '100%', padding: '0.5rem 0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.84rem', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                      Ref / Lot No (Optional)
                    </label>
                    <input
                      type="text"
                      value={form.refLotNo}
                      onChange={(e) => setForm((p) => ({ ...p, refLotNo: e.target.value }))}
                      placeholder="e.g. LOT-885"
                      style={{ width: '100%', padding: '0.5rem 0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.84rem', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                {/* Process Type Quick Chips */}
                <div style={{ marginTop: '0.75rem' }}>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: '5px' }}>
                    Process Type
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
                    {PROCESS_PRESETS.map((proc) => {
                      const isSel = form.processType === proc;
                      return (
                        <button
                          key={proc}
                          type="button"
                          onClick={() => setForm((p) => ({ ...p, processType: proc }))}
                          style={{
                            padding: '4px 11px',
                            borderRadius: '999px',
                            border: isSel ? `1px solid ${brandColor}` : '1px solid #cbd5e1',
                            background: isSel ? brandColor : '#ffffff',
                            color: isSel ? '#ffffff' : '#475569',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          {proc}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Section 2: Design & Item Details */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.55rem' }}>
                  <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#0f172a' }}>
                    Design &amp; Item Details
                  </div>
                  <button
                    type="button"
                    onClick={handleAddRow}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      padding: '0.4rem 0.8rem',
                      borderRadius: '8px',
                      border: `1px solid ${brandColor}`,
                      background: `${brandColor}12`,
                      color: brandColor,
                      fontWeight: 800,
                      fontSize: '0.78rem',
                      cursor: 'pointer',
                    }}
                  >
                    <Plus size={14} />
                    Add Design Row
                  </button>
                </div>

                <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'visible' }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', textAlign: 'left' }}>
                          <th style={{ padding: '0.55rem 0.5rem', width: 30, textAlign: 'center' }}>#</th>
                          <th style={{ padding: '0.55rem 0.5rem', width: 58, textAlign: 'center' }}>Image</th>
                          <th style={{ padding: '0.55rem 0.5rem', minWidth: 130 }}>Design No. *</th>
                          <th style={{ padding: '0.55rem 0.5rem', minWidth: 185 }}>Item / Fabric Description</th>
                          <th style={{ padding: '0.55rem 0.5rem', minWidth: 130 }}>Size / Ratio</th>
                          <th style={{ padding: '0.55rem 0.5rem', width: 76 }}>Qty *</th>
                          <th style={{ padding: '0.55rem 0.5rem', width: 78 }}>Unit</th>
                          <th style={{ padding: '0.55rem 0.5rem', width: 76 }}>Rate (₹)</th>
                          <th style={{ padding: '0.55rem 0.5rem', minWidth: 120 }}>Remarks</th>
                          <th style={{ padding: '0.55rem 0.5rem', width: 42, textAlign: 'center' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {form.items.map((item, idx) => {
                          const sugs = designSuggestions[idx] || [];
                          return (
                            <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '0.45rem 0.4rem', textAlign: 'center', fontWeight: 700, color: '#64748b' }}>
                                {idx + 1}
                              </td>
                              <td style={{ padding: '0.45rem 0.4rem', textAlign: 'center' }}>
                                {item.designImageUrl ? (
                                  <img
                                    src={convertDriveUrl(item.designImageUrl)}
                                    alt={item.designNo}
                                    onClick={() => setZoomImage({ url: convertDriveUrl(item.designImageUrl), title: item.designNo })}
                                    style={{
                                      width: 42,
                                      height: 42,
                                      objectFit: 'cover',
                                      borderRadius: '6px',
                                      border: `1.5px solid ${brandColor}66`,
                                      cursor: 'pointer',
                                    }}
                                  />
                                ) : (
                                  <div
                                    title="Enter a Design No. to auto-load its image"
                                    style={{
                                      width: 42,
                                      height: 42,
                                      borderRadius: '6px',
                                      background: '#f1f5f9',
                                      border: '1px dashed #cbd5e1',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      color: '#94a3b8',
                                    }}
                                  >
                                    <ImageIcon size={16} />
                                  </div>
                                )}
                              </td>
                              <td style={{ padding: '0.45rem 0.4rem', position: 'relative' }}>
                                <input
                                  type="text"
                                  value={item.designNo}
                                  onFocus={() => setActiveSuggestRow(idx)}
                                  onBlur={() => setTimeout(() => setActiveSuggestRow((cur) => (cur === idx ? null : cur)), 200)}
                                  onChange={(e) => handleItemChange(idx, 'designNo', e.target.value)}
                                  placeholder="e.g. D-1042"
                                  style={{
                                    width: '100%',
                                    padding: '0.42rem 0.55rem',
                                    borderRadius: '7px',
                                    border: `1px solid ${item.designImageUrl ? brandColor : '#cbd5e1'}`,
                                    fontWeight: 700,
                                    fontSize: '0.8rem',
                                    boxSizing: 'border-box',
                                  }}
                                />
                                {activeSuggestRow === idx && sugs.length > 0 && (
                                  <div
                                    style={{
                                      position: 'absolute',
                                      top: '100%',
                                      left: 6,
                                      zIndex: 50,
                                      width: 270,
                                      maxHeight: 210,
                                      overflowY: 'auto',
                                      background: '#ffffff',
                                      border: '1px solid #cbd5e1',
                                      borderRadius: '10px',
                                      boxShadow: '0 10px 25px rgba(15,23,42,0.18)',
                                    }}
                                  >
                                    {sugs.map((sug) => (
                                      <button
                                        key={sug.designNo}
                                        type="button"
                                        onMouseDown={() => handleSelectDesignSuggestion(idx, sug)}
                                        style={{
                                          width: '100%',
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '0.55rem',
                                          padding: '0.45rem 0.6rem',
                                          border: 'none',
                                          borderBottom: '1px solid #f1f5f9',
                                          background: '#ffffff',
                                          textAlign: 'left',
                                          cursor: 'pointer',
                                        }}
                                      >
                                        {sug.imageUrl ? (
                                          <img
                                            src={convertDriveUrl(sug.imageUrl)}
                                            alt={sug.designNo}
                                            style={{ width: 32, height: 32, borderRadius: '5px', objectFit: 'cover', flexShrink: 0 }}
                                          />
                                        ) : (
                                          <div style={{ width: 32, height: 32, borderRadius: '5px', background: '#f1f5f9', flexShrink: 0 }} />
                                        )}
                                        <div style={{ minWidth: 0 }}>
                                          <div style={{ fontWeight: 800, fontSize: '0.8rem', color: '#0f172a' }}>{sug.designNo}</div>
                                          <div style={{ fontSize: '0.7rem', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {sug.description || sug.fabricName || 'Design Master'}
                                          </div>
                                        </div>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </td>
                              <td style={{ padding: '0.45rem 0.4rem' }}>
                                <input
                                  type="text"
                                  value={item.description}
                                  onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                                  placeholder="Fabric / garment details"
                                  style={{ width: '100%', padding: '0.42rem 0.55rem', borderRadius: '7px', border: '1px solid #cbd5e1', fontSize: '0.8rem', boxSizing: 'border-box' }}
                                />
                              </td>
                              <td style={{ padding: '0.45rem 0.4rem' }}>
                                <input
                                  type="text"
                                  value={item.sizeRatio}
                                  onChange={(e) => handleItemChange(idx, 'sizeRatio', e.target.value)}
                                  placeholder="S-20, M-30, L-30"
                                  style={{ width: '100%', padding: '0.42rem 0.55rem', borderRadius: '7px', border: '1px solid #cbd5e1', fontSize: '0.8rem', boxSizing: 'border-box' }}
                                />
                              </td>
                              <td style={{ padding: '0.45rem 0.4rem' }}>
                                <input
                                  type="number"
                                  min="0"
                                  value={item.qty}
                                  onChange={(e) => handleItemChange(idx, 'qty', e.target.value)}
                                  style={{ width: '100%', padding: '0.42rem 0.45rem', borderRadius: '7px', border: '1px solid #cbd5e1', fontWeight: 700, fontSize: '0.8rem', boxSizing: 'border-box' }}
                                />
                              </td>
                              <td style={{ padding: '0.45rem 0.4rem' }}>
                                <select
                                  value={item.unit}
                                  onChange={(e) => handleItemChange(idx, 'unit', e.target.value)}
                                  style={{ width: '100%', padding: '0.42rem 0.35rem', borderRadius: '7px', border: '1px solid #cbd5e1', fontSize: '0.8rem', boxSizing: 'border-box' }}
                                >
                                  {UNIT_OPTIONS.map((u) => (
                                    <option key={u} value={u}>{u}</option>
                                  ))}
                                </select>
                              </td>
                              <td style={{ padding: '0.45rem 0.4rem' }}>
                                <input
                                  type="number"
                                  min="0"
                                  value={item.rate}
                                  onChange={(e) => handleItemChange(idx, 'rate', e.target.value)}
                                  style={{ width: '100%', padding: '0.42rem 0.45rem', borderRadius: '7px', border: '1px solid #cbd5e1', fontSize: '0.8rem', boxSizing: 'border-box' }}
                                />
                              </td>
                              <td style={{ padding: '0.45rem 0.4rem' }}>
                                <input
                                  type="text"
                                  value={item.remarks}
                                  onChange={(e) => handleItemChange(idx, 'remarks', e.target.value)}
                                  placeholder="Notes..."
                                  style={{ width: '100%', padding: '0.42rem 0.55rem', borderRadius: '7px', border: '1px solid #cbd5e1', fontSize: '0.8rem', boxSizing: 'border-box' }}
                                />
                              </td>
                              <td style={{ padding: '0.45rem 0.4rem', textAlign: 'center' }}>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveRow(idx)}
                                  style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                                  title="Remove Row"
                                >
                                  <Trash2 size={15} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Live Summary Bar */}
                <div
                  style={{
                    marginTop: '0.6rem',
                    padding: '0.6rem 0.9rem',
                    borderRadius: '9px',
                    background: `${brandColor}14`,
                    border: `1px solid ${brandColor}40`,
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.75rem',
                    fontSize: '0.82rem',
                    fontWeight: 800,
                    color: '#0f172a',
                  }}
                >
                  <div>
                    Total Designs: <span style={{ color: brandColor }}>{formSummary.totalDesigns}</span>
                    {'  |  '}
                    Total Quantity: <span style={{ color: brandColor }}>{formSummary.totalQty} {form.items[0]?.unit || 'Pcs'}</span>
                    {formSummary.totalValue > 0 && (
                      <>
                        {'  |  '}
                        Est. Job Value: <span style={{ color: brandColor }}>₹{formSummary.totalValue.toLocaleString('en-IN')}</span>
                      </>
                    )}
                  </div>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.76rem', fontWeight: 700, color: '#334155', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={form.showRateInPrint}
                      onChange={(e) => setForm((p) => ({ ...p, showRateInPrint: e.target.checked }))}
                    />
                    Show Rate in PDF / Print
                  </label>
                </div>
              </div>

              {/* Section 3: Notes & Terms */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                    Special Instructions / Notes
                  </label>
                  <textarea
                    rows={2}
                    value={form.notes}
                    onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                    placeholder="Stitching quality instructions, packing notes..."
                    style={{ width: '100%', padding: '0.5rem 0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box', resize: 'vertical' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                    Challan Terms
                  </label>
                  <textarea
                    rows={2}
                    value={form.terms}
                    onChange={(e) => setForm((p) => ({ ...p, terms: e.target.value }))}
                    style={{ width: '100%', padding: '0.5rem 0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box', resize: 'vertical' }}
                  />
                </div>
              </div>
            </div>

            {/* Sticky Footer */}
            <div
              style={{
                padding: '0.85rem 1.25rem',
                borderTop: '1px solid #e2e8f0',
                background: '#f8fafc',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: '0.6rem',
                flexWrap: 'wrap',
              }}
            >
              <button
                type="button"
                onClick={() => setShowFormModal(false)}
                style={{ padding: '0.55rem 1rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#ffffff', color: '#475569', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => handleSave('DRAFT', false)}
                style={{ padding: '0.55rem 1rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#ffffff', color: '#0f172a', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}
              >
                Save Draft
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => handleSave('ISSUED', true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.58rem 1.15rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: brandGradient,
                  color: '#ffffff',
                  fontWeight: 800,
                  fontSize: '0.84rem',
                  cursor: 'pointer',
                }}
              >
                <Save size={15} />
                {saving ? 'Saving...' : 'Save & Preview Challan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* VIEW & PRINTABLE JOB CHALLAN MODAL                                     */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {previewChallan && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.7)',
            backdropFilter: 'blur(4px)',
            zIndex: 99995,
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
          }}
          onClick={() => setPreviewChallan(null)}
        >
          {/* Top Action Bar */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#ffffff',
              borderBottom: '1px solid #e2e8f0',
              padding: '0.75rem 1.25rem',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.75rem',
              position: 'sticky',
              top: 0,
              zIndex: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span style={{ fontWeight: 900, fontSize: '1.05rem', color: '#0f172a' }}>
                Job Challan #{previewChallan.challanNo}
              </span>
              <span
                style={{
                  background: `${brandColor}18`,
                  color: brandColor,
                  border: `1px solid ${brandColor}44`,
                  borderRadius: '999px',
                  padding: '2px 10px',
                  fontSize: '0.72rem',
                  fontWeight: 800,
                }}
              >
                {previewChallan.status}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleBrowserPrint}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.5rem 0.9rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: brandGradient,
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                }}
              >
                <Printer size={14} />
                Print Challan
              </button>
              <button
                type="button"
                onClick={() => handleDownloadPdf(previewChallan)}
                disabled={downloadingId === previewChallan._id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.5rem 0.9rem',
                  borderRadius: '8px',
                  border: `1px solid ${brandColor}`,
                  background: '#ffffff',
                  color: brandColor,
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                }}
              >
                <Download size={14} />
                {downloadingId === previewChallan._id ? 'Generating...' : 'Download PDF'}
              </button>
              <button
                type="button"
                onClick={() => handleWhatsAppShare(previewChallan)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.5rem 0.9rem',
                  borderRadius: '8px',
                  border: '1px solid #86efac',
                  background: '#f0fdf4',
                  color: '#15803d',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                }}
              >
                <MessageCircle size={14} />
                WhatsApp
              </button>
              <button
                type="button"
                onClick={() => openEditModal(previewChallan)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.5rem 0.9rem',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#334155',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                }}
              >
                <Edit2 size={14} />
                Edit
              </button>
              <button
                type="button"
                onClick={() => setPreviewChallan(null)}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#f8fafc',
                  color: '#475569',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Centered A4 Challan Sheet */}
          <div style={{ padding: '1.5rem 1rem', display: 'flex', justifyContent: 'center' }} onClick={(e) => e.stopPropagation()}>
            <div
              style={{
                width: '100%',
                maxWidth: '820px',
                background: '#ffffff',
                borderRadius: '12px',
                borderTop: `8px solid ${brandColor}`,
                padding: '1.75rem 2rem',
                boxShadow: '0 20px 50px rgba(0,0,0,0.28)',
              }}
            >
              {/* Sheet Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: '10px',
                      background: brandGradient,
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 900,
                      fontSize: '1.05rem',
                    }}
                  >
                    {company.code}
                  </div>
                  <div>
                    <div style={{ fontSize: '1.45rem', fontWeight: 900, color: '#0f172a', letterSpacing: '0.02em' }}>
                      {company.name.toUpperCase()}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#475569' }}>
                      {company.type} — Surat, Gujarat
                    </div>
                  </div>
                </div>

                {/* JOB CHALLAN Box */}
                <div style={{ border: `1.5px solid ${brandColor}`, borderRadius: '8px', overflow: 'hidden', minWidth: 230 }}>
                  <div style={{ background: brandColor, color: '#ffffff', textAlign: 'center', fontWeight: 900, fontSize: '0.84rem', padding: '5px 10px', letterSpacing: '0.06em' }}>
                    JOB CHALLAN
                  </div>
                  <div style={{ padding: '0.5rem 0.75rem', fontSize: '0.78rem', display: 'grid', gridTemplateColumns: '78px 1fr', rowGap: '3px' }}>
                    <span style={{ fontWeight: 700, color: '#475569' }}>Challan No:</span>
                    <span style={{ fontWeight: 800, color: '#0f172a' }}>{previewChallan.challanNo}</span>
                    <span style={{ fontWeight: 700, color: '#475569' }}>Date:</span>
                    <span>{fmtDate(previewChallan.challanDate)}</span>
                    <span style={{ fontWeight: 700, color: '#475569' }}>Due Date:</span>
                    <span>{fmtDate(previewChallan.expectedReturnDate)}</span>
                    <span style={{ fontWeight: 700, color: '#475569' }}>Process:</span>
                    <span style={{ fontWeight: 700 }}>{previewChallan.processType || '—'}</span>
                  </div>
                </div>
              </div>

              {/* Party & Meta Banner */}
              <div
                style={{
                  background: `${brandColor}10`,
                  border: `1px solid ${brandColor}40`,
                  borderRadius: '8px',
                  padding: '0.8rem 1rem',
                  display: 'grid',
                  gridTemplateColumns: '1.4fr 1fr',
                  gap: '1rem',
                  marginBottom: '1rem',
                  fontSize: '0.82rem',
                }}
              >
                <div style={{ borderRight: `1px solid ${brandColor}33`, paddingRight: '0.85rem' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 800, color: brandColor, textTransform: 'uppercase' }}>
                    {previewChallan.challanType === 'RECEIVE' ? 'Received From (Party / Karigar)' : 'Issued To (Party / Karigar)'}
                  </div>
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
                    {previewChallan.party?.name || '—'}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: '2px' }}>
                    {[previewChallan.party?.address, previewChallan.party?.phone ? `Ph: ${previewChallan.party.phone}` : ''].filter(Boolean).join(' | ') || '—'}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '92px 1fr', rowGap: '3px', fontSize: '0.79rem' }}>
                  <span style={{ fontWeight: 700, color: '#475569' }}>Challan Type:</span>
                  <span style={{ fontWeight: 700 }}>{previewChallan.challanType === 'RECEIVE' ? 'Job Work Receive' : 'Job Work Issue'}</span>
                  <span style={{ fontWeight: 700, color: '#475569' }}>Ref / Lot No:</span>
                  <span>{previewChallan.refLotNo || '—'}</span>
                  <span style={{ fontWeight: 700, color: '#475569' }}>Total Designs:</span>
                  <span style={{ fontWeight: 800 }}>{previewChallan.totalDesigns || previewChallan.items?.length || 0}</span>
                  <span style={{ fontWeight: 700, color: '#475569' }}>Total Qty:</span>
                  <span style={{ fontWeight: 800, color: brandColor }}>
                    {previewChallan.totalQty || 0} {previewChallan.items?.[0]?.unit || 'Pcs'}
                  </span>
                </div>
              </div>

              {/* Design Items Table with Images */}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.81rem', marginBottom: '0.9rem' }}>
                <thead>
                  <tr style={{ background: '#0f172a', color: '#ffffff', textAlign: 'left' }}>
                    <th style={{ padding: '0.55rem 0.5rem', textAlign: 'center', width: 30 }}>#</th>
                    <th style={{ padding: '0.55rem 0.5rem', textAlign: 'center', width: 64 }}>Design</th>
                    <th style={{ padding: '0.55rem 0.6rem' }}>Design No.</th>
                    <th style={{ padding: '0.55rem 0.6rem' }}>Description / Fabric</th>
                    <th style={{ padding: '0.55rem 0.6rem' }}>Size / Ratio</th>
                    <th style={{ padding: '0.55rem 0.6rem', textAlign: 'right' }}>Qty</th>
                    {previewChallan.showRateInPrint && (
                      <th style={{ padding: '0.55rem 0.6rem', textAlign: 'right' }}>Rate</th>
                    )}
                    <th style={{ padding: '0.55rem 0.6rem' }}>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {(previewChallan.items || []).map((it, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0', background: idx % 2 === 1 ? '#f8fafc' : '#ffffff' }}>
                      <td style={{ padding: '0.55rem 0.5rem', textAlign: 'center', fontWeight: 700 }}>{idx + 1}</td>
                      <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                        {it.designImageUrl ? (
                          <img
                            src={convertDriveUrl(it.designImageUrl)}
                            alt={it.designNo}
                            onClick={() => setZoomImage({ url: convertDriveUrl(it.designImageUrl), title: it.designNo })}
                            style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: '6px', border: '1px solid #cbd5e1', cursor: 'pointer' }}
                          />
                        ) : (
                          <div style={{ width: 48, height: 48, borderRadius: '6px', background: '#f1f5f9', border: '1px solid #e2e8f0', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', color: '#94a3b8' }}>
                            No Img
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '0.55rem 0.6rem', fontWeight: 800, color: brandColor }}>
                        <div>{it.designNo}</div>
                        {it.processType && <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>{it.processType}</div>}
                      </td>
                      <td style={{ padding: '0.55rem 0.6rem' }}>{it.description || '—'}</td>
                      <td style={{ padding: '0.55rem 0.6rem' }}>{it.sizeRatio || '—'}</td>
                      <td style={{ padding: '0.55rem 0.6rem', textAlign: 'right', fontWeight: 800 }}>
                        {it.qty} <span style={{ fontWeight: 600, fontSize: '0.73rem', color: '#64748b' }}>{it.unit || 'Pcs'}</span>
                      </td>
                      {previewChallan.showRateInPrint && (
                        <td style={{ padding: '0.55rem 0.6rem', textAlign: 'right' }}>
                          {it.rate ? `₹${it.rate}` : '—'}
                        </td>
                      )}
                      <td style={{ padding: '0.55rem 0.6rem', color: '#475569' }}>{it.remarks || '—'}</td>
                    </tr>
                  ))}
                  <tr style={{ background: `${brandColor}18`, fontWeight: 900 }}>
                    <td colSpan={previewChallan.showRateInPrint ? 8 : 7} style={{ padding: '0.6rem 0.8rem', textAlign: 'right', color: '#0f172a' }}>
                      TOTAL: {previewChallan.totalDesigns || previewChallan.items?.length || 0} Design(s) &nbsp;|&nbsp;{' '}
                      <span style={{ color: brandColor }}>
                        {previewChallan.totalQty || 0} {previewChallan.items?.[0]?.unit || 'Pcs'}
                      </span>
                      {previewChallan.showRateInPrint && previewChallan.totalValue > 0 && (
                        <> &nbsp;|&nbsp; Est. Value: ₹{Number(previewChallan.totalValue).toLocaleString('en-IN')}</>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Special Instructions */}
              <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0.65rem 0.9rem', fontSize: '0.78rem', color: '#475569', marginBottom: '2.25rem' }}>
                <strong style={{ color: '#0f172a', display: 'block', marginBottom: '2px' }}>Special Instructions &amp; Terms:</strong>
                {previewChallan.notes && <div>{previewChallan.notes}</div>}
                {previewChallan.terms && <div>{previewChallan.terms}</div>}
              </div>

              {/* 3-Column Signatures */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', textAlign: 'center', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginTop: '1.5rem' }}>
                <div style={{ borderTop: '1px solid #64748b', paddingTop: '6px' }}>Prepared By</div>
                <div style={{ borderTop: '1px solid #64748b', paddingTop: '6px' }}>Receiver / Karigar Sign</div>
                <div style={{ borderTop: '1px solid #64748b', paddingTop: '6px' }}>For {company.name} (Auth. Signatory)</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Design Image Zoom Lightbox */}
      {zoomImage && (
        <div
          onClick={() => setZoomImage(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.82)',
            zIndex: 100000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem',
          }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ position: 'relative', maxWidth: '90vw', maxHeight: '88vh' }}>
            <img
              src={zoomImage.url}
              alt={zoomImage.title}
              style={{ maxWidth: '85vw', maxHeight: '80vh', borderRadius: '12px', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}
            />
            <div style={{ textAlign: 'center', color: '#ffffff', fontWeight: 800, marginTop: '0.6rem', fontSize: '0.95rem' }}>
              Design: {zoomImage.title}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
