import React, { useState, useEffect, useRef } from 'react';
import Navbar from '../components/Navbar';
import GovHeader from '../components/GovHeader';
import TricolorStrip from '../components/TricolorStrip';
import GovTicker from '../components/GovTicker';
import Footer from '../components/Footer';
import AdminKPIs from '../components/AdminKPIs';
import LiveQueueTable from '../components/LiveQueueTable';
import DisputeTable from '../components/DisputeTable';
import PaymentEscalation from '../components/PaymentEscalation';
import PaymentBreakdownBar from '../components/PaymentBreakdownBar';
import { adminService } from '../services/api';
import { useLanguage } from '../context/LanguageContext';
import {
  Building2, MessageSquareWarning, AlertOctagon,
  RefreshCw, Calendar, ShieldCheck, CheckCircle2, AlertCircle, X
} from 'lucide-react';

const AdminDashboard = () => {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'disputes' | 'escalations'
  const [date, setDate] = useState('2026-09-10');
  const [stats, setStats] = useState(null);
  const [centres, setCentres] = useState([]);
  const [disputes, setDisputes] = useState([]);
  const [escalations, setEscalations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [disputeError, setDisputeError] = useState(null);
  const [disputeSuccess, setDisputeSuccess] = useState(null);
  const [disputeLoadError, setDisputeLoadError] = useState(null);

  // Track request sequence to prevent overlapping fetches from producing stale/inconsistent state
  const disputesReqIdRef = useRef(0);

  const fetchDisputes = async () => {
    const reqId = ++disputesReqIdRef.current;
    try {
      const data = await adminService.getDisputes();
      if (reqId === disputesReqIdRef.current) {
        if (Array.isArray(data)) {
          setDisputes(data);
          setDisputeLoadError(null);
        }
      }
      return data;
    } catch (err) {
      if (reqId === disputesReqIdRef.current) {
        const msg = typeof err === 'string' ? err : (err.message || 'Failed to load disputes');
        console.error('Failed to load disputes:', err);
        setDisputeLoadError(msg);
      }
      throw err;
    }
  };

  useEffect(() => {
    loadAllData();
  }, [date]);

  useEffect(() => {
    if (activeTab === 'disputes') {
      fetchDisputes().catch(() => {});
    }
  }, [activeTab]);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [overviewData] = await Promise.allSettled([
        adminService.getOverview(date),
        fetchDisputes(),
      ]);

      if (overviewData.status === 'fulfilled') {
        setStats(overviewData.value);
        setCentres(overviewData.value?.centres || []);
      } else {
        console.error('Failed to load admin overview', overviewData.reason);
      }
    } catch (err) {
      console.error('Failed to load admin data', err);
    } finally {
      setLoading(false);
    }
  };

  const handleResolveDispute = async (procId) => {
    setDisputeError(null);
    setDisputeSuccess(null);
    try {
      await adminService.resolveDispute(procId);
      // Keep successful resolution message because backend already confirmed resolution
      setDisputeSuccess(`Dispute for procurement #${procId} resolved successfully.`);

      const [, overviewRes] = await Promise.allSettled([
        fetchDisputes(),
        adminService.getOverview(date),
      ]);

      // Handle overview refresh independently
      if (overviewRes.status === 'fulfilled') {
        setStats(overviewRes.value);
        setCentres(overviewRes.value?.centres || []);
      } else {
        console.warn('Failed to refresh overview after dispute resolution:', overviewRes.reason);
      }
    } catch (err) {
      const msg = typeof err === 'string' ? err : (err.message || 'Failed to resolve dispute');
      console.error('Failed to resolve dispute:', err);
      setDisputeError(msg);
    }
  };


  const handleForcePay = async (bookingId) => {
    await adminService.forcePay(bookingId);
    const updated = await adminService.getPaymentEscalations();
    setEscalations(updated);
  };

  const handleSimulateDelay = () => {
    const updated = adminService.simulateDelay();
    setEscalations(updated);
  };

  const activeDisputesCount = disputes.filter(d => d.status === 'DISPUTED').length;
  const overdueCount = escalations.filter(e => e.status !== 'CREDITED').length;

  return (
    <div className="min-h-screen flex flex-col bg-[#F3F4F6] text-slate-800">
      <GovHeader />
      <TricolorStrip />
      <Navbar />
      <GovTicker />

      {/* Main Content Area */}
      <main id="main-content" className="flex-1 max-w-7xl w-full mx-auto px-4 md:px-8 py-6">
        
        {/* District Title & Filters Header */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-300">
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-xl md:text-2xl font-black text-[#0F2253]">
                {t.admin.title}
              </h1>
              <span className="bg-blue-100 text-blue-900 text-[10px] font-bold px-2 py-0.5 rounded border border-blue-300 uppercase">
                DFSO Nodal
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {t.admin.subtitle}
            </p>
          </div>

          <div className="flex items-center space-x-3">
            {/* Operational Date Filter */}
            <div className="flex items-center space-x-1.5 bg-white border border-slate-300 px-2.5 py-1.5 rounded text-xs">
              <Calendar className="w-3.5 h-3.5 text-[#1E3A8A]" />
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="font-mono text-xs font-semibold text-slate-700 bg-transparent focus:outline-none"
              />
            </div>

            {/* Refresh Button */}
            <button
              onClick={loadAllData}
              disabled={loading}
              className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 transition shadow-2xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#1E3A8A] ${loading ? 'animate-spin' : ''}`} />
              <span>{t.dashboard.refresh}</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation Navigation Strip */}
        <div className="mb-6 flex flex-wrap border-b border-slate-300 gap-1">
          
          {/* Tab 1: Overview & Queue */}
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2.5 text-xs font-bold flex items-center gap-2 border-b-2 transition ${
              activeTab === 'overview'
                ? 'border-[#1E3A8A] text-[#1E3A8A] bg-white rounded-t-md shadow-xs'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>{t.admin.tabOverview}</span>
          </button>

          {/* Tab 2: SMS Disputes */}
          <button
            onClick={() => setActiveTab('disputes')}
            className={`px-4 py-2.5 text-xs font-bold flex items-center gap-2 border-b-2 transition ${
              activeTab === 'disputes'
                ? 'border-[#1E3A8A] text-[#1E3A8A] bg-white rounded-t-md shadow-xs'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <MessageSquareWarning className="w-4 h-4 text-red-600" />
            <span>{t.admin.tabDisputes}</span>
            {activeDisputesCount > 0 && (
              <span className="bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                {activeDisputesCount}
              </span>
            )}
          </button>

          {/* Tab 3: Payment Escalations (>5 Days) */}
          <button
            onClick={() => setActiveTab('escalations')}
            className={`px-4 py-2.5 text-xs font-bold flex items-center gap-2 border-b-2 transition ${
              activeTab === 'escalations'
                ? 'border-[#1E3A8A] text-[#1E3A8A] bg-white rounded-t-md shadow-xs'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <AlertOctagon className="w-4 h-4 text-amber-600" />
            <span>{t.admin.tabEscalations}</span>
            {overdueCount > 0 && (
              <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                {overdueCount}
              </span>
            )}
          </button>

        </div>

        {/* Tab 1: Overview, KPIs, Live Queue & Payments */}
        {activeTab === 'overview' && (
          <div className="space-y-6 animate-fadeIn">
            <AdminKPIs stats={stats} />
            <LiveQueueTable centres={centres} queueAvailable={stats?.queue_available !== false} />
            <PaymentBreakdownBar stats={stats?.payments} />
          </div>
        )}

        {/* Tab 2: SMS Disputes Panel */}
        {activeTab === 'disputes' && (
          <div className="space-y-4 animate-fadeIn">
            {/* Resolution Success Message */}
            {disputeSuccess && (
              <div className="p-3 bg-green-50 border-l-4 border-green-500 text-green-800 text-xs rounded-r flex items-center justify-between shadow-xs">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                  <span className="font-semibold">{disputeSuccess}</span>
                </div>
                <button
                  onClick={() => setDisputeSuccess(null)}
                  className="text-green-700 hover:text-green-900 font-bold p-1 hover:bg-green-100 rounded"
                  title="Dismiss"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Resolution Error Message */}
            {disputeError && (
              <div className="p-3 bg-red-50 border-l-4 border-red-500 text-red-800 text-xs rounded-r flex items-center justify-between shadow-xs">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  <span className="font-semibold">{disputeError}</span>
                </div>
                <button
                  onClick={() => setDisputeError(null)}
                  className="text-red-700 hover:text-red-900 font-bold p-1 hover:bg-red-100 rounded"
                  title="Dismiss"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Loading / Refresh Error Banner */}
            {disputeLoadError && (
              <div className="p-3 bg-amber-50 border-l-4 border-amber-500 text-amber-900 text-xs rounded-r flex items-center justify-between shadow-xs">
                <div className="flex items-center gap-2">
                  <AlertOctagon className="w-4 h-4 text-amber-600 shrink-0" />
                  <div>
                    <span className="font-bold">Failed to load disputes: </span>
                    <span>{disputeLoadError}</span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setDisputeLoadError(null);
                    loadAllData();
                  }}
                  className="bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 px-2.5 py-1 rounded text-xs font-bold transition ml-2 shrink-0 flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>{t.dashboard.refresh}</span>
                </button>
              </div>
            )}

            {/* If load failed and no disputes available, show error state instead of misleading 'No Active Disputes' */}
            {disputeLoadError && disputes.length === 0 ? (
              <div className="gov-card rounded-lg shadow-sm border border-red-200 p-8 text-center bg-white">
                <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
                <h3 className="font-bold text-slate-800 text-sm mb-1">Disputes Unavailable</h3>
                <p className="text-xs text-slate-500 mb-4">{disputeLoadError}</p>
                <button
                  onClick={loadAllData}
                  className="bg-[#1E3A8A] hover:bg-[#0F2253] text-white px-3.5 py-1.5 rounded text-xs font-bold transition shadow-xs inline-flex items-center gap-1.5 mx-auto"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>{t.dashboard.refresh}</span>
                </button>
              </div>
            ) : (
              <DisputeTable
                disputes={disputes}
                onResolve={handleResolveDispute}
              />
            )}
          </div>
        )}

        {/* Tab 3: Payment Escalation Panel with WOW Feature 5 */}
        {activeTab === 'escalations' && (
          <div className="space-y-6 animate-fadeIn">
            <PaymentEscalation
              escalations={escalations}
              onForcePay={handleForcePay}
              onSimulateDelay={handleSimulateDelay}
            />
          </div>
        )}

      </main>

      <Footer />
    </div>
  );
};

export default AdminDashboard;
