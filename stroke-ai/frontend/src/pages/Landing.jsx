/**
 * Landing Page - Role Selection
 * Entry point with glassmorphism cards for Patient/Doctor/Admin roles
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, Stethoscope, Shield, Activity } from 'lucide-react';

export default function Landing() {
    const roles = [
        {
            id: 'patient',
            title: 'Patient',
            description: 'Submit health information for early stroke risk assessment and receive triage recommendations.',
            icon: Heart,
            color: '#10b981',
            glow: 'rgba(16, 185, 129, 0.15)',
            link: '/login?role=patient',
        },
        {
            id: 'doctor',
            title: 'Healthcare Provider',
            description: 'Review patient assessments, manage triage queue, and provide clinical oversight.',
            icon: Stethoscope,
            color: '#3b82f6',
            glow: 'rgba(59, 130, 246, 0.15)',
            link: '/login?role=doctor',
        },
        {
            id: 'admin',
            title: 'Administrator',
            description: 'Access system analytics, manage users, and monitor clinical decision support performance.',
            icon: Shield,
            color: '#8b5cf6',
            glow: 'rgba(139, 92, 246, 0.15)',
            link: '/login?role=admin',
        },
    ];

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ position: 'relative', overflow: 'hidden' }}>
            {/* Decorative Background Orbs */}
            <div className="bg-orb bg-orb-1" />
            <div className="bg-orb bg-orb-2" />
            <div className="bg-orb bg-orb-3" />

            {/* Hero Section */}
            <div className="text-center mb-6 fade-in" style={{ position: 'relative', zIndex: 1 }}>
                <div className="flex items-center justify-center gap-3 mb-6">
                    <div style={{
                        width: 56, height: 56, borderRadius: '16px',
                        background: 'linear-gradient(135deg, rgba(59,130,246,0.2), rgba(139,92,246,0.2))',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 0 30px rgba(59,130,246,0.15)'
                    }}>
                        <Activity size={32} style={{ color: '#3b82f6' }} />
                    </div>
                    <h1 className="text-4xl md:text-5xl font-bold" style={{ letterSpacing: '-0.03em' }}>
                        Stroke<span style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Triage</span>
                    </h1>
                </div>
                <p className="text-xl text-secondary max-w-2xl mx-auto" style={{ lineHeight: 1.6 }}>
                    Early Stroke Detection & Smart Clinical Triage System
                </p>
                <p className="text-sm text-muted mt-3">
                    Clinical Decision Support System (CDSS) for Healthcare Professionals
                </p>
            </div>

            {/* Gradient Divider */}
            <div style={{ width: '80px', height: '2px', background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)', borderRadius: '2px', margin: '0 auto 2.5rem' }} />

            {/* Role Selection Cards */}
            <div className="grid grid-cols-3 gap-6 max-w-5xl w-full mb-12" style={{ position: 'relative', zIndex: 1 }}>
                {roles.map((role, index) => (
                    <Link
                        key={role.id}
                        to={role.link}
                        className="glass-card text-center cursor-pointer slide-up"
                        style={{
                            animationDelay: `${index * 120}ms`,
                            padding: '2.5rem 2rem',
                            transition: 'all 0.3s cubic-bezier(.4,0,.2,1)',
                            boxShadow: 'none',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.boxShadow = `0 0 40px ${role.glow}, 0 8px 32px rgba(0,0,0,0.3)`;
                            e.currentTarget.style.borderColor = `${role.color}30`;
                            e.currentTarget.style.transform = 'translateY(-4px)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.boxShadow = 'none';
                            e.currentTarget.style.borderColor = '';
                            e.currentTarget.style.transform = 'translateY(0)';
                        }}
                    >
                        <div
                            className="w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center"
                            style={{
                                background: `radial-gradient(circle, ${role.glow}, transparent)`,
                                border: `1px solid ${role.color}25`,
                            }}
                        >
                            <role.icon size={36} style={{ color: role.color }} />
                        </div>
                        <h3 className="text-xl font-semibold mb-3">{role.title}</h3>
                        <p className="text-secondary text-sm leading-relaxed" style={{ minHeight: '3rem' }}>
                            {role.description}
                        </p>
                        <div className="mt-6">
                            <span
                                className="btn btn-primary"
                                style={{
                                    background: `linear-gradient(135deg, ${role.color}, ${role.color}cc)`,
                                    boxShadow: `0 4px 20px ${role.color}30`,
                                    width: '100%',
                                }}
                            >
                                Continue as {role.title}
                            </span>
                        </div>
                    </Link>
                ))}
            </div>

            {/* Medical Disclaimer */}
            <div className="disclaimer max-w-3xl text-center" style={{ position: 'relative', zIndex: 1 }}>
                <p className="font-medium mb-2" style={{ color: '#f59e0b' }}>⚕️ Clinical Decision Support System</p>
                <p className="text-sm" style={{ color: '#d97706' }}>
                    This system assists healthcare professionals with early stroke warning and triage
                    prioritization. It is <strong>NOT</strong> a diagnostic tool. All clinical decisions
                    must be validated by licensed medical professionals.
                </p>
            </div>

            {/* Footer */}
            <footer className="mt-12 text-center text-muted text-sm" style={{ position: 'relative', zIndex: 1 }}>
                <div style={{ width: 60, height: 1, background: 'rgba(255,255,255,0.08)', margin: '0 auto 1rem' }} />
                <p>© 2025 StrokeTriage CDSS. For authorized healthcare use only.</p>
            </footer>
        </div>
    );
}
