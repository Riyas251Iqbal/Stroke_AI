/**
 * Admin Dashboard
 * System statistics, user management, patient management, and audit logs
 */

import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { adminAPI } from '../services/api';
import {
    Activity,
    Users,
    AlertTriangle,
    TrendingUp,
    Clock,
    Shield,
    LogOut,
    User,
    BarChart3,
    RefreshCw,
    UserCheck,
    UserX,
    Search,
    Filter,
    ChevronRight,
    FileText,
    Eye,
    Building2,
    MapPin,
    Plus,
    Edit3,
    Trash2,
    X,
    Save
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

export default function AdminDashboard() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('overview');
    const [stats, setStats] = useState(null);
    const [analytics, setAnalytics] = useState(null);
    const [users, setUsers] = useState([]);
    const [auditLogs, setAuditLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [roleFilter, setRoleFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedUser, setSelectedUser] = useState(null);
    const [userDetailsLoading, setUserDetailsLoading] = useState(false);

    // Hospital management state
    const [hospitals, setHospitals] = useState([]);
    const [showHospitalForm, setShowHospitalForm] = useState(false);
    const [editingHospital, setEditingHospital] = useState(null);
    const [hospitalForm, setHospitalForm] = useState({ name: '', location: '', address: '', phone: '' });

    // Deletion requests state
    const [deletionRequests, setDeletionRequests] = useState([]);
    const [deletionFilter, setDeletionFilter] = useState('pending');
    const [rejectNote, setRejectNote] = useState('');
    const [rejectingId, setRejectingId] = useState(null);

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        if (activeTab === 'users' || activeTab === 'patients') {
            fetchUsers();
        } else if (activeTab === 'audit') {
            fetchAuditLogs();
        } else if (activeTab === 'hospitals') {
            fetchHospitals();
        } else if (activeTab === 'deletions') {
            fetchDeletionRequests();
        }
    }, [activeTab, roleFilter, statusFilter, deletionFilter]);

    const fetchData = async () => {
        try {
            const [statsRes, analyticsRes] = await Promise.all([
                adminAPI.getStats(),
                adminAPI.getTriageAnalytics({ days: 30 })
            ]);
            setStats(statsRes.data.stats);
            setAnalytics(analyticsRes.data.analytics);
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const fetchHospitals = async () => {
        try {
            const res = await adminAPI.getHospitals();
            setHospitals(res.data.hospitals || []);
        } catch (err) {
            console.error('Failed to fetch hospitals:', err);
        }
    };

    const handleSaveHospital = async () => {
        try {
            if (editingHospital) {
                await adminAPI.updateHospital(editingHospital.id, hospitalForm);
            } else {
                await adminAPI.createHospital(hospitalForm);
            }
            setShowHospitalForm(false);
            setEditingHospital(null);
            setHospitalForm({ name: '', location: '', address: '', phone: '' });
            fetchHospitals();
        } catch (err) {
            console.error('Failed to save hospital:', err);
        }
    };

    const handleEditHospital = (h) => {
        setEditingHospital(h);
        setHospitalForm({ name: h.name, location: h.location, address: h.address || '', phone: h.phone || '' });
        setShowHospitalForm(true);
    };

    const handleDeleteHospital = async (id) => {
        try {
            await adminAPI.deleteHospital(id);
            fetchHospitals();
        } catch (err) {
            console.error('Failed to deactivate hospital:', err);
        }
    };

    const fetchUsers = async () => {
        try {
            const params = {};
            if (activeTab === 'patients') {
                params.role = 'patient';
            } else if (roleFilter) {
                params.role = roleFilter;
            }
            if (statusFilter) {
                params.active = statusFilter === 'active';
            }
            const response = await adminAPI.getUsers(params);
            setUsers(response.data.users);
        } catch (error) {
            console.error('Error fetching users:', error);
        }
    };

    const fetchAuditLogs = async () => {
        try {
            const response = await adminAPI.getAuditLog({ limit: 100 });
            setAuditLogs(response.data.logs);
        } catch (error) {
            console.error('Error fetching audit logs:', error);
        }
    };

    const handleActivateUser = async (userId) => {
        try {
            await adminAPI.activateUser(userId);
            fetchUsers();
        } catch (error) {
            console.error('Error activating user:', error);
        }
    };

    const handleDeactivateUser = async (userId) => {
        if (window.confirm('Are you sure you want to deactivate this user?')) {
            try {
                await adminAPI.deactivateUser(userId);
                fetchUsers();
            } catch (error) {
                console.error('Error deactivating user:', error);
            }
        }
    };

    const handleViewUser = async (userId) => {
        setUserDetailsLoading(true);
        try {
            const response = await adminAPI.getUserDetails(userId);
            setSelectedUser(response.data.user);
        } catch (error) {
            console.error('Error fetching user details:', error);
        } finally {
            setUserDetailsLoading(false);
        }
    };

    const handleRefresh = () => {
        setRefreshing(true);
        fetchData();
        if (activeTab === 'users' || activeTab === 'patients') {
            fetchUsers();
        } else if (activeTab === 'audit') {
            fetchAuditLogs();
        } else if (activeTab === 'deletions') {
            fetchDeletionRequests();
        }
    };

    const fetchDeletionRequests = async () => {
        try {
            const res = await adminAPI.getDeletionRequests(deletionFilter);
            setDeletionRequests(res.data.deletion_requests || []);
        } catch (err) {
            console.error('Failed to fetch deletion requests:', err);
        }
    };

    const handleApproveDeletion = async (id, userName) => {
        if (window.confirm(`Are you sure you want to permanently delete the account of "${userName}" and ALL their data? This cannot be undone.`)) {
            try {
                await adminAPI.approveDeletion(id);
                fetchDeletionRequests();
                fetchData();
            } catch (err) {
                alert(err.response?.data?.error || 'Failed to approve deletion');
            }
        }
    };

    const handleRejectDeletion = async (id) => {
        try {
            await adminAPI.rejectDeletion(id, rejectNote);
            setRejectingId(null);
            setRejectNote('');
            fetchDeletionRequests();
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to reject deletion');
        }
    };

    const handleLogout = async () => {
        await logout();
        navigate('/');
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return 'Never';
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const COLORS = ['#10b981', '#f59e0b', '#ef4444'];

    const pieData = stats ? [
        { name: 'Low', value: stats.low_cases || 0 },
        { name: 'Medium', value: stats.medium_cases || 0 },
        { name: 'Emergency', value: stats.emergency_cases || 0 },
    ] : [];

    const trendData = analytics?.daily_trends?.slice(0, 14).reverse().map(d => ({
        date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        assessments: d.assessments,
        emergencies: d.emergencies,
        avgRisk: (d.avg_risk * 100).toFixed(0)
    })) || [];

    const filteredUsers = users.filter(u =>
        searchQuery === '' ||
        u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.username?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const tabs = [
        { id: 'overview', label: 'Overview', icon: BarChart3 },
        { id: 'users', label: 'Users', icon: Users },
        { id: 'patients', label: 'Patients', icon: User },
        { id: 'hospitals', label: 'Hospitals', icon: Building2 },
        { id: 'deletions', label: 'Deletion Requests', icon: Trash2 },
        { id: 'audit', label: 'Audit Log', icon: FileText },
    ];

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="spinner mx-auto mb-4" />
                    <p className="text-secondary">Loading admin console...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen">
            {/* Header */}
            <header className="glass-card-static" style={{ borderRadius: 0, marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="container flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <Activity size={28} style={{ color: '#3b82f6' }} />
                        <span className="text-xl font-bold">
                            Stroke<span style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Triage</span>
                        </span>
                        <span className="text-sm px-2 py-1 rounded" style={{ background: 'rgba(139, 92, 246, 0.10)', color: '#a78bfa' }}>
                            Admin Console
                        </span>
                    </div>
                    <div className="flex items-center gap-4">
                        <button
                            onClick={handleRefresh}
                            className="btn btn-secondary btn-sm"
                            disabled={refreshing}
                        >
                            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                            Refresh
                        </button>
                        <div className="flex items-center gap-2">
                            <Shield size={18} className="text-muted" />
                            <span className="text-secondary">{user?.fullName}</span>
                        </div>
                        <button onClick={handleLogout} className="btn btn-secondary btn-sm">
                            <LogOut size={16} />
                        </button>
                    </div>
                </div>
            </header>

            {/* Tab Navigation */}
            <div className="container mb-6">
                <div className="flex gap-2">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`btn btn-sm flex items-center gap-2 ${activeTab === tab.id ? 'btn-primary' : 'btn-secondary'}`}
                        >
                            <tab.icon size={16} />
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="container">
                {/* Overview Tab */}
                {activeTab === 'overview' && (
                    <>
                        {/* Stats Grid */}
                        <div className="grid grid-cols-4 gap-4 mb-8">
                            <div className="glass-card-static slide-up">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'rgba(59, 130, 246, 0.12)' }}>
                                        <Users size={24} style={{ color: '#3b82f6' }} />
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold">{stats?.total_users || 0}</p>
                                        <p className="text-sm text-secondary">Total Users</p>
                                    </div>
                                </div>
                            </div>

                            <div className="glass-card-static slide-up" style={{ animationDelay: '50ms' }}>
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'rgba(16, 185, 129, 0.12)' }}>
                                        <BarChart3 size={24} style={{ color: '#10b981' }} />
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold">{stats?.total_assessments || 0}</p>
                                        <p className="text-sm text-secondary">Total Assessments</p>
                                    </div>
                                </div>
                            </div>

                            <div className="glass-card-static slide-up" style={{ animationDelay: '100ms' }}>
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'rgba(239, 68, 68, 0.12)' }}>
                                        <AlertTriangle size={24} style={{ color: '#ef4444' }} />
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold">{stats?.emergency_cases || 0}</p>
                                        <p className="text-sm text-secondary">Emergency Cases</p>
                                    </div>
                                </div>
                            </div>

                            <div className="glass-card-static slide-up" style={{ animationDelay: '150ms' }}>
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'rgba(245, 158, 11, 0.12)' }}>
                                        <Clock size={24} style={{ color: '#f59e0b' }} />
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold">{stats?.pending_reviews || 0}</p>
                                        <p className="text-sm text-secondary">Pending Reviews</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Charts Row */}
                        <div className="grid gap-6 mb-8" style={{ gridTemplateColumns: '2fr 1fr' }}>
                            {/* Trend Chart */}
                            <div className="glass-card-static slide-up" style={{ animationDelay: '200ms' }}>
                                <h3 className="font-semibold mb-4 flex items-center gap-2">
                                    <TrendingUp size={18} style={{ color: '#3b82f6' }} />
                                    Assessment Trends (Last 14 Days)
                                </h3>
                                <div style={{ height: 250 }}>
                                    {trendData.length > 0 ? (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <LineChart data={trendData}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,102,241,0.10)" />
                                                <XAxis dataKey="date" stroke="#64748b" fontSize={12} />
                                                <YAxis stroke="#64748b" fontSize={12} />
                                                <Tooltip
                                                    contentStyle={{
                                                        background: 'rgba(255,255,255,0.85)',
                                                        backdropFilter: 'blur(12px)',
                                                        border: '1px solid rgba(99,102,241,0.15)',
                                                        borderRadius: 8,
                                                        color: '#1e293b'
                                                    }}
                                                />
                                                <Line type="monotone" dataKey="assessments" stroke="#3b82f6" strokeWidth={2} dot={false} />
                                                <Line type="monotone" dataKey="emergencies" stroke="#ef4444" strokeWidth={2} dot={false} />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="flex items-center justify-center h-full text-muted">
                                            No trend data available
                                        </div>
                                    )}
                                </div>
                                <div className="flex justify-center gap-6 mt-4 text-sm">
                                    <div className="flex items-center gap-2">
                                        <div className="w-3 h-3 rounded-full" style={{ background: '#3b82f6' }} />
                                        <span className="text-secondary">Assessments</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-3 h-3 rounded-full" style={{ background: '#ef4444' }} />
                                        <span className="text-secondary">Emergencies</span>
                                    </div>
                                </div>
                            </div>

                            {/* Pie Chart */}
                            <div className="glass-card-static slide-up" style={{ animationDelay: '250ms' }}>
                                <h3 className="font-semibold mb-4">Triage Distribution</h3>
                                <div style={{ height: 200 }}>
                                    {pieData.some(d => d.value > 0) ? (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie
                                                    data={pieData}
                                                    cx="50%"
                                                    cy="50%"
                                                    innerRadius={50}
                                                    outerRadius={80}
                                                    dataKey="value"
                                                    label={({ name, value }) => `${name}: ${value}`}
                                                >
                                                    {pieData.map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill={COLORS[index]} />
                                                    ))}
                                                </Pie>
                                                <Tooltip />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="flex items-center justify-center h-full text-muted">
                                            No data available
                                        </div>
                                    )}
                                </div>
                                <div className="flex justify-center gap-4 mt-2 text-xs">
                                    <span style={{ color: '#10b981' }}>● Low</span>
                                    <span style={{ color: '#f59e0b' }}>● Medium</span>
                                    <span style={{ color: '#ef4444' }}>● Emergency</span>
                                </div>
                            </div>
                        </div>

                        {/* Quick Stats */}
                        <div className="grid grid-cols-3 gap-6 mb-8">
                            <div className="glass-card-static slide-up" style={{ animationDelay: '300ms' }}>
                                <h4 className="text-sm text-secondary mb-2">Average Risk Score</h4>
                                <p className="text-3xl font-bold">{((stats?.average_risk_score || 0) * 100).toFixed(1)}%</p>
                            </div>
                            <div className="glass-card-static slide-up" style={{ animationDelay: '350ms' }}>
                                <h4 className="text-sm text-secondary mb-2">Assessments Today</h4>
                                <p className="text-3xl font-bold">{stats?.assessments_today || 0}</p>
                            </div>
                            <div className="glass-card-static slide-up" style={{ animationDelay: '400ms' }}>
                                <h4 className="text-sm text-secondary mb-2">Active Doctors</h4>
                                <p className="text-3xl font-bold">{stats?.total_doctors || 0}</p>
                            </div>
                        </div>
                    </>
                )}

                {/* Users Tab */}
                {activeTab === 'users' && (
                    <div className="glass-card-static">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-semibold flex items-center gap-2">
                                <Users size={20} style={{ color: '#3b82f6' }} />
                                User Management
                            </h2>
                            <div className="flex gap-3">
                                {/* Search */}
                                <div className="relative">
                                    <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted" />
                                    <input
                                        type="text"
                                        placeholder="Search users..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="input pl-10"
                                        style={{ width: '200px' }}
                                    />
                                </div>
                                {/* Role Filter */}
                                <select
                                    value={roleFilter}
                                    onChange={(e) => setRoleFilter(e.target.value)}
                                    className="select"
                                >
                                    <option value="">All Roles</option>
                                    <option value="patient">Patients</option>
                                    <option value="doctor">Doctors</option>
                                    <option value="admin">Admins</option>
                                </select>
                                {/* Status Filter */}
                                <select
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value)}
                                    className="select"
                                >
                                    <option value="">All Status</option>
                                    <option value="active">Active</option>
                                    <option value="inactive">Inactive</option>
                                </select>
                            </div>
                        </div>

                        {/* Users Table */}
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="text-left text-secondary text-sm" style={{ borderBottom: '1px solid rgba(99,102,241,0.12)' }}>
                                        <th className="pb-3 font-medium">User</th>
                                        <th className="pb-3 font-medium">Role</th>
                                        <th className="pb-3 font-medium">Status</th>
                                        <th className="pb-3 font-medium">Last Login</th>
                                        <th className="pb-3 font-medium">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredUsers.map((u) => (
                                        <tr key={u.id} style={{ borderBottom: '1px solid rgba(99,102,241,0.06)' }} className="hover:bg-white/5">
                                            <td className="py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(59, 130, 246, 0.12)' }}>
                                                        <User size={18} style={{ color: '#3b82f6' }} />
                                                    </div>
                                                    <div>
                                                        <p className="font-medium">{u.full_name || u.username}</p>
                                                        <p className="text-sm text-muted">{u.email}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-4">
                                                <span className="px-2 py-1 rounded text-xs font-medium" style={{
                                                    background: u.role === 'admin' ? 'rgba(139,92,246,0.10)' : u.role === 'doctor' ? 'rgba(59,130,246,0.10)' : 'rgba(16,185,129,0.10)',
                                                    color: u.role === 'admin' ? '#7c3aed' : u.role === 'doctor' ? '#2563eb' : '#059669'
                                                }}>
                                                    {u.role.charAt(0).toUpperCase() + u.role.slice(1)}
                                                </span>
                                            </td>
                                            <td className="py-4">
                                                <span className="flex items-center gap-1" style={{ color: u.is_active ? '#059669' : '#dc2626' }}>
                                                    <span className="w-2 h-2 rounded-full" style={{ background: u.is_active ? '#059669' : '#dc2626' }} />
                                                    {u.is_active ? 'Active' : 'Inactive'}
                                                </span>
                                            </td>
                                            <td className="py-4 text-secondary text-sm">
                                                {formatDate(u.last_login)}
                                            </td>
                                            <td className="py-4">
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => handleViewUser(u.id)}
                                                        className="btn btn-secondary btn-sm"
                                                        title="View Details"
                                                    >
                                                        <Eye size={14} />
                                                    </button>
                                                    {u.is_active ? (
                                                        <button
                                                            onClick={() => handleDeactivateUser(u.id)}
                                                            className="btn btn-sm"
                                                            style={{ background: 'rgba(239, 68, 68, 0.10)', color: '#dc2626' }}
                                                            title="Deactivate"
                                                            disabled={u.id === user?.id}
                                                        >
                                                            <UserX size={14} />
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={() => handleActivateUser(u.id)}
                                                            className="btn btn-sm"
                                                            style={{ background: 'rgba(16, 185, 129, 0.10)', color: '#059669' }}
                                                            title="Activate"
                                                        >
                                                            <UserCheck size={14} />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {filteredUsers.length === 0 && (
                                <div className="text-center py-8 text-muted">
                                    No users found
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Patients Tab */}
                {activeTab === 'patients' && (
                    <div className="glass-card-static">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-semibold flex items-center gap-2">
                                <User size={20} style={{ color: '#10b981' }} />
                                Patient Management
                            </h2>
                            <div className="relative">
                                <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted" />
                                <input
                                    type="text"
                                    placeholder="Search patients..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="input pl-10"
                                    style={{ width: '250px' }}
                                />
                            </div>
                        </div>

                        {/* Patients Table */}
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="text-left text-secondary text-sm" style={{ borderBottom: '1px solid rgba(99,102,241,0.12)' }}>
                                        <th className="pb-3 font-medium">Patient</th>
                                        <th className="pb-3 font-medium">Status</th>
                                        <th className="pb-3 font-medium">Registered</th>
                                        <th className="pb-3 font-medium">Last Login</th>
                                        <th className="pb-3 font-medium">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredUsers.map((u) => (
                                        <tr key={u.id} style={{ borderBottom: '1px solid rgba(99,102,241,0.06)' }} className="hover:bg-white/5">
                                            <td className="py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(16, 185, 129, 0.12)' }}>
                                                        <User size={18} style={{ color: '#10b981' }} />
                                                    </div>
                                                    <div>
                                                        <p className="font-medium">{u.full_name || u.username}</p>
                                                        <p className="text-sm text-muted">{u.email}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-4">
                                                <span className="flex items-center gap-1" style={{ color: u.is_active ? '#059669' : '#dc2626' }}>
                                                    <span className="w-2 h-2 rounded-full" style={{ background: u.is_active ? '#059669' : '#dc2626' }} />
                                                    {u.is_active ? 'Active' : 'Inactive'}
                                                </span>
                                            </td>
                                            <td className="py-4 text-secondary text-sm">
                                                {formatDate(u.created_at)}
                                            </td>
                                            <td className="py-4 text-secondary text-sm">
                                                {formatDate(u.last_login)}
                                            </td>
                                            <td className="py-4">
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => handleViewUser(u.id)}
                                                        className="btn btn-secondary btn-sm"
                                                    >
                                                        <Eye size={14} />
                                                        View Details
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {filteredUsers.length === 0 && (
                                <div className="text-center py-8 text-muted">
                                    No patients found
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Audit Log Tab */}
                {activeTab === 'audit' && (() => {
                    // Compute action summary counts
                    const actionCounts = auditLogs.reduce((acc, log) => {
                        const action = log.action || '';
                        if (action.includes('login')) acc.logins++;
                        else if (action.includes('register')) acc.registrations++;
                        else if (action.includes('deactivate')) acc.deactivations++;
                        else if (action.includes('activate')) acc.activations++;
                        else acc.other++;
                        return acc;
                    }, { logins: 0, registrations: 0, activations: 0, deactivations: 0, other: 0 });

                    const getActionStyle = (action) => {
                        if (!action) return { bg: 'rgba(100,116,139,0.10)', color: '#94a3b8', icon: '📋' };
                        if (action.includes('delete')) return { bg: 'rgba(239,68,68,0.10)', color: '#f87171', icon: '🗑️' };
                        if (action.includes('deactivate')) return { bg: 'rgba(239,68,68,0.10)', color: '#f87171', icon: '🚫' };
                        if (action.includes('activate')) return { bg: 'rgba(16,185,129,0.10)', color: '#34d399', icon: '✅' };
                        if (action.includes('login')) return { bg: 'rgba(59,130,246,0.10)', color: '#60a5fa', icon: '🔑' };
                        if (action.includes('register')) return { bg: 'rgba(139,92,246,0.10)', color: '#a78bfa', icon: '👤' };
                        if (action.includes('triage') || action.includes('assessment')) return { bg: 'rgba(245,158,11,0.10)', color: '#fbbf24', icon: '📊' };
                        return { bg: 'rgba(100,116,139,0.10)', color: '#94a3b8', icon: '📋' };
                    };

                    return (
                        <div>
                            {/* Section Header */}
                            <div className="section-header">
                                <div className="section-icon" style={{ background: 'rgba(245, 158, 11, 0.10)' }}>
                                    <FileText size={18} style={{ color: '#f59e0b' }} />
                                </div>
                                <h2>Audit Log</h2>
                                <span className="text-sm text-muted" style={{ marginLeft: 'auto' }}>
                                    {auditLogs.length} event{auditLogs.length !== 1 ? 's' : ''}
                                </span>
                            </div>

                            {/* Summary Chips */}
                            {auditLogs.length > 0 && (
                                <div className="flex flex-wrap gap-3 mb-6">
                                    {[
                                        { label: 'Logins', count: actionCounts.logins, bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.15)', color: '#60a5fa' },
                                        { label: 'Registrations', count: actionCounts.registrations, bg: 'rgba(139,92,246,0.08)', border: 'rgba(139,92,246,0.15)', color: '#a78bfa' },
                                        { label: 'Activations', count: actionCounts.activations, bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.15)', color: '#34d399' },
                                        { label: 'Deactivations', count: actionCounts.deactivations, bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.15)', color: '#f87171' },
                                        { label: 'Other', count: actionCounts.other, bg: 'rgba(100,116,139,0.08)', border: 'rgba(100,116,139,0.15)', color: '#94a3b8' },
                                    ].filter(c => c.count > 0).map(chip => (
                                        <div key={chip.label} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium" style={{
                                            background: chip.bg,
                                            border: `1px solid ${chip.border}`,
                                            color: chip.color
                                        }}>
                                            <span style={{ fontSize: '1rem', fontWeight: 700 }}>{chip.count}</span>
                                            {chip.label}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Log Table */}
                            <div className="glass-card-static" style={{ padding: 0, overflow: 'hidden' }}>
                                <div className="overflow-x-auto">
                                    <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                                <th className="text-left text-secondary text-xs font-semibold py-3 px-4" style={{ width: '18%', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Timestamp</th>
                                                <th className="text-left text-secondary text-xs font-semibold py-3 px-4" style={{ width: '18%', textTransform: 'uppercase', letterSpacing: '0.05em' }}>User</th>
                                                <th className="text-left text-secondary text-xs font-semibold py-3 px-4" style={{ width: '20%', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Action</th>
                                                <th className="text-left text-secondary text-xs font-semibold py-3 px-4" style={{ width: '16%', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Resource</th>
                                                <th className="text-left text-secondary text-xs font-semibold py-3 px-4" style={{ width: '28%', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Details</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {auditLogs.map((log, index) => {
                                                const style = getActionStyle(log.action);
                                                return (
                                                    <tr key={index} className="hover:bg-white/5" style={{
                                                        borderBottom: index < auditLogs.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                                                        transition: 'background 0.15s ease'
                                                    }}>
                                                        <td className="py-3.5 px-4">
                                                            <span className="text-sm text-secondary" style={{ whiteSpace: 'nowrap' }}>
                                                                {formatDate(log.timestamp)}
                                                            </span>
                                                        </td>
                                                        <td className="py-3.5 px-4">
                                                            <div className="flex items-center gap-2">
                                                                <div style={{
                                                                    width: 28, height: 28, borderRadius: '8px',
                                                                    background: 'rgba(255,255,255,0.06)',
                                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                    fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', flexShrink: 0
                                                                }}>
                                                                    {(log.full_name || log.username || 'S').charAt(0).toUpperCase()}
                                                                </div>
                                                                <span className="font-medium text-sm">{log.full_name || log.username || 'System'}</span>
                                                            </div>
                                                        </td>
                                                        <td className="py-3.5 px-4">
                                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold" style={{
                                                                background: style.bg,
                                                                color: style.color,
                                                                letterSpacing: '0.02em'
                                                            }}>
                                                                <span style={{ fontSize: '0.75rem' }}>{style.icon}</span>
                                                                {log.action?.replace(/_/g, ' ').toUpperCase()}
                                                            </span>
                                                        </td>
                                                        <td className="py-3.5 px-4">
                                                            <span className="text-sm">
                                                                {log.resource_type}
                                                                {log.resource_id && <span className="text-muted"> #{log.resource_id}</span>}
                                                            </span>
                                                        </td>
                                                        <td className="py-3.5 px-4">
                                                            <span className="text-sm text-muted" style={{ lineHeight: 1.4 }}>
                                                                {log.details || '—'}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                                {auditLogs.length === 0 && (
                                    <div className="text-center py-12">
                                        <FileText size={40} style={{ color: 'var(--text-muted)', margin: '0 auto 1rem', opacity: 0.4 }} />
                                        <p className="text-secondary font-medium mb-1">No audit logs yet</p>
                                        <p className="text-sm text-muted">System activity will appear here as events occur.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })()}

                {/* Hospitals Tab */}
                {activeTab === 'hospitals' && (
                    <div className="glass-card-static">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-semibold flex items-center gap-2">
                                <Building2 size={20} style={{ color: '#3b82f6' }} />
                                Hospital Management
                            </h2>
                            <button
                                className="btn btn-primary btn-sm"
                                onClick={() => {
                                    setEditingHospital(null);
                                    setHospitalForm({ name: '', location: '', address: '', phone: '' });
                                    setShowHospitalForm(true);
                                }}
                            >
                                <Plus size={16} />
                                Add Hospital
                            </button>
                        </div>

                        {/* Add/Edit Form */}
                        {showHospitalForm && (
                            <div className="p-4 rounded-lg mb-6" style={{ background: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(59, 130, 246, 0.15)' }}>
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="font-semibold">{editingHospital ? 'Edit Hospital' : 'Add New Hospital'}</h3>
                                    <button onClick={() => { setShowHospitalForm(false); setEditingHospital(null); }} className="text-muted hover:text-primary">
                                        <X size={18} />
                                    </button>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="input-group">
                                        <label className="input-label">Hospital Name *</label>
                                        <input
                                            type="text"
                                            className="input"
                                            placeholder="e.g. Apollo Hospital"
                                            value={hospitalForm.name}
                                            onChange={(e) => setHospitalForm({ ...hospitalForm, name: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div className="input-group">
                                        <label className="input-label">Location / Area *</label>
                                        <input
                                            type="text"
                                            className="input"
                                            placeholder="e.g. Chennai - Adyar"
                                            value={hospitalForm.location}
                                            onChange={(e) => setHospitalForm({ ...hospitalForm, location: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div className="input-group">
                                        <label className="input-label">Address</label>
                                        <input
                                            type="text"
                                            className="input"
                                            placeholder="Full street address"
                                            value={hospitalForm.address}
                                            onChange={(e) => setHospitalForm({ ...hospitalForm, address: e.target.value })}
                                        />
                                    </div>
                                    <div className="input-group">
                                        <label className="input-label">Phone</label>
                                        <input
                                            type="text"
                                            className="input"
                                            placeholder="Contact number"
                                            value={hospitalForm.phone}
                                            onChange={(e) => setHospitalForm({ ...hospitalForm, phone: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div className="flex justify-end mt-4">
                                    <button
                                        className="btn btn-primary btn-sm"
                                        onClick={handleSaveHospital}
                                        disabled={!hospitalForm.name || !hospitalForm.location}
                                    >
                                        <Save size={16} />
                                        {editingHospital ? 'Update' : 'Create'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Hospitals Table */}
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="text-left text-secondary text-sm" style={{ borderBottom: '1px solid rgba(99,102,241,0.12)' }}>
                                        <th className="pb-3 font-medium">Hospital Name</th>
                                        <th className="pb-3 font-medium">Location</th>
                                        <th className="pb-3 font-medium">Address</th>
                                        <th className="pb-3 font-medium">Phone</th>
                                        <th className="pb-3 font-medium">Doctors</th>
                                        <th className="pb-3 font-medium">Status</th>
                                        <th className="pb-3 font-medium">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {hospitals.map((h) => (
                                        <tr key={h.id} style={{ borderBottom: '1px solid rgba(99,102,241,0.06)' }} className="hover:bg-white/5">
                                            <td className="py-3">
                                                <div className="flex items-center gap-2">
                                                    <Building2 size={16} style={{ color: '#3b82f6' }} />
                                                    <span className="font-medium">{h.name}</span>
                                                </div>
                                            </td>
                                            <td className="py-3">
                                                <div className="flex items-center gap-1">
                                                    <MapPin size={14} className="text-muted" />
                                                    <span className="text-sm">{h.location}</span>
                                                </div>
                                            </td>
                                            <td className="py-3 text-sm text-secondary">{h.address || '-'}</td>
                                            <td className="py-3 text-sm">{h.phone || '-'}</td>
                                            <td className="py-3">
                                                <span className="px-2 py-1 rounded-full text-xs font-semibold" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
                                                    {h.doctor_count || 0}
                                                </span>
                                            </td>
                                            <td className="py-3">
                                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${h.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                    {h.is_active ? 'Active' : 'Inactive'}
                                                </span>
                                            </td>
                                            <td className="py-3">
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => handleEditHospital(h)}
                                                        className="p-1.5 rounded-lg hover:bg-blue-50" title="Edit"
                                                    >
                                                        <Edit3 size={15} style={{ color: '#2563eb' }} />
                                                    </button>
                                                    {h.is_active && (
                                                        <button
                                                            onClick={() => handleDeleteHospital(h.id)}
                                                            className="p-1.5 rounded-lg hover:bg-red-50" title="Deactivate"
                                                        >
                                                            <Trash2 size={15} style={{ color: '#dc2626' }} />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {hospitals.length === 0 && (
                                <div className="text-center py-8 text-muted">
                                    No hospitals added yet. Click "Add Hospital" to get started.
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Deletion Requests Tab */}
                {activeTab === 'deletions' && (
                    <div className="glass-card-static">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-semibold flex items-center gap-2">
                                <Trash2 size={20} style={{ color: '#dc2626' }} />
                                Account Deletion Requests
                            </h2>
                            <select
                                value={deletionFilter}
                                onChange={(e) => setDeletionFilter(e.target.value)}
                                className="select"
                            >
                                <option value="pending">Pending</option>
                                <option value="approved">Approved</option>
                                <option value="rejected">Rejected</option>
                                <option value="all">All</option>
                            </select>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="text-left text-secondary text-sm" style={{ borderBottom: '1px solid rgba(99,102,241,0.12)' }}>
                                        <th className="pb-3 font-medium">User</th>
                                        <th className="pb-3 font-medium">Role</th>
                                        <th className="pb-3 font-medium">Reason</th>
                                        <th className="pb-3 font-medium">Requested</th>
                                        <th className="pb-3 font-medium">Status</th>
                                        <th className="pb-3 font-medium">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {deletionRequests.map((req) => (
                                        <tr key={req.id} style={{ borderBottom: '1px solid rgba(99,102,241,0.06)' }} className="hover:bg-white/5">
                                            <td className="py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(239, 68, 68, 0.12)' }}>
                                                        <User size={18} style={{ color: '#dc2626' }} />
                                                    </div>
                                                    <div>
                                                        <p className="font-medium">{req.full_name || req.username}</p>
                                                        <p className="text-sm text-muted">{req.email}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-4">
                                                <span className="px-2 py-1 rounded text-xs font-medium" style={{
                                                    background: req.role === 'doctor' ? 'rgba(59,130,246,0.10)' : 'rgba(16,185,129,0.10)',
                                                    color: req.role === 'doctor' ? '#2563eb' : '#059669'
                                                }}>
                                                    {req.role?.charAt(0).toUpperCase() + req.role?.slice(1)}
                                                </span>
                                            </td>
                                            <td className="py-4 text-sm text-secondary" style={{ maxWidth: '200px' }}>
                                                {req.reason || <span className="text-muted italic">No reason provided</span>}
                                            </td>
                                            <td className="py-4 text-secondary text-sm">
                                                {formatDate(req.requested_at)}
                                            </td>
                                            <td className="py-4">
                                                <span className="px-2 py-1 rounded text-xs font-medium" style={{
                                                    background: req.status === 'pending' ? 'rgba(245, 158, 11, 0.12)' : req.status === 'approved' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                                                    color: req.status === 'pending' ? '#d97706' : req.status === 'approved' ? '#059669' : '#dc2626'
                                                }}>
                                                    {req.status?.charAt(0).toUpperCase() + req.status?.slice(1)}
                                                </span>
                                            </td>
                                            <td className="py-4">
                                                {req.status === 'pending' && (
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => handleApproveDeletion(req.id, req.full_name)}
                                                            className="btn btn-sm"
                                                            style={{ background: 'rgba(239, 68, 68, 0.10)', color: '#dc2626' }}
                                                            title="Approve & Delete"
                                                        >
                                                            <Trash2 size={14} />
                                                            Approve
                                                        </button>
                                                        <button
                                                            onClick={() => setRejectingId(rejectingId === req.id ? null : req.id)}
                                                            className="btn btn-secondary btn-sm"
                                                            title="Reject"
                                                        >
                                                            <X size={14} />
                                                            Reject
                                                        </button>
                                                    </div>
                                                )}
                                                {req.status === 'rejected' && req.review_note && (
                                                    <span className="text-xs text-muted">Note: {req.review_note}</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                    {/* Inline reject note form */}
                                    {rejectingId && (
                                        <tr>
                                            <td colSpan={6} className="py-3">
                                                <div className="flex gap-3 items-end p-3 rounded-lg" style={{ background: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.15)' }}>
                                                    <div className="flex-1">
                                                        <label className="text-xs text-secondary mb-1 block">Rejection note (optional)</label>
                                                        <input
                                                            type="text"
                                                            className="input"
                                                            placeholder="Reason for rejecting this request..."
                                                            value={rejectNote}
                                                            onChange={(e) => setRejectNote(e.target.value)}
                                                        />
                                                    </div>
                                                    <button
                                                        onClick={() => handleRejectDeletion(rejectingId)}
                                                        className="btn btn-sm"
                                                        style={{ background: '#d97706', color: '#fff' }}
                                                    >
                                                        Confirm Reject
                                                    </button>
                                                    <button
                                                        onClick={() => { setRejectingId(null); setRejectNote(''); }}
                                                        className="btn btn-secondary btn-sm"
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                            {deletionRequests.length === 0 && (
                                <div className="text-center py-8 text-muted">
                                    No {deletionFilter !== 'all' ? deletionFilter : ''} deletion requests found
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* User Details Modal */}
                {selectedUser && (
                    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(4px)' }} onClick={() => setSelectedUser(null)}>
                        <div className="glass-card-static max-w-lg w-full mx-4" onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-between items-start mb-6">
                                <h3 className="text-xl font-semibold">User Details</h3>
                                <button onClick={() => setSelectedUser(null)} className="text-muted hover:text-primary">✕</button>
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-center gap-4">
                                    <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: 'rgba(59, 130, 246, 0.12)' }}>
                                        <User size={32} style={{ color: '#3b82f6' }} />
                                    </div>
                                    <div>
                                        <h4 className="text-lg font-semibold">{selectedUser.full_name}</h4>
                                        <p className="text-secondary">{selectedUser.email}</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4 mt-6">
                                    <div className="p-3 rounded-lg" style={{ background: 'rgba(99,102,241,0.05)' }}>
                                        <p className="text-xs text-muted mb-1">Role</p>
                                        <p className="font-medium">{selectedUser.role?.charAt(0).toUpperCase() + selectedUser.role?.slice(1)}</p>
                                    </div>
                                    <div className="p-3 rounded-lg" style={{ background: 'rgba(99,102,241,0.05)' }}>
                                        <p className="text-xs text-muted mb-1">Status</p>
                                        <p className={`font-medium ${selectedUser.is_active ? 'text-green-400' : 'text-red-400'}`}>
                                            {selectedUser.is_active ? 'Active' : 'Inactive'}
                                        </p>
                                    </div>
                                    <div className="p-3 rounded-lg" style={{ background: 'rgba(99,102,241,0.05)' }}>
                                        <p className="text-xs text-muted mb-1">Registered</p>
                                        <p className="font-medium text-sm">{formatDate(selectedUser.created_at)}</p>
                                    </div>
                                    <div className="p-3 rounded-lg" style={{ background: 'rgba(99,102,241,0.05)' }}>
                                        <p className="text-xs text-muted mb-1">Last Login</p>
                                        <p className="font-medium text-sm">{formatDate(selectedUser.last_login)}</p>
                                    </div>
                                </div>

                                {selectedUser.triage_stats && (
                                    <div className="mt-4 p-4 rounded-lg" style={{ background: 'rgba(16, 185, 129, 0.08)' }}>
                                        <h5 className="font-medium mb-3" style={{ color: '#059669' }}>Triage Statistics</h5>
                                        <div className="grid grid-cols-3 gap-4 text-center">
                                            <div>
                                                <p className="text-2xl font-bold">{selectedUser.triage_stats.total_assessments || 0}</p>
                                                <p className="text-xs text-muted">Assessments</p>
                                            </div>
                                            <div>
                                                <p className="text-2xl font-bold">{((selectedUser.triage_stats.avg_risk || 0) * 100).toFixed(0)}%</p>
                                                <p className="text-xs text-muted">Avg Risk</p>
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium">{formatDate(selectedUser.triage_stats.last_assessment)}</p>
                                                <p className="text-xs text-muted">Last Assessment</p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {selectedUser.review_stats && (
                                    <div className="mt-4 p-4 rounded-lg" style={{ background: 'rgba(59, 130, 246, 0.08)' }}>
                                        <h5 className="font-medium mb-3" style={{ color: '#2563eb' }}>Review Statistics</h5>
                                        <div className="grid grid-cols-2 gap-4 text-center">
                                            <div>
                                                <p className="text-2xl font-bold">{selectedUser.review_stats.total_reviews || 0}</p>
                                                <p className="text-xs text-muted">Total Reviews</p>
                                            </div>
                                            <div>
                                                <p className="text-2xl font-bold">{selectedUser.review_stats.escalations || 0}</p>
                                                <p className="text-xs text-muted">Escalations</p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="flex justify-end mt-6">
                                <button onClick={() => setSelectedUser(null)} className="btn btn-secondary">
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Footer */}
                <div className="text-center text-sm text-muted py-8">
                    <p>StrokeTriage CDSS Admin Console • For authorized personnel only</p>
                </div>
            </div>
        </div>
    );
}
