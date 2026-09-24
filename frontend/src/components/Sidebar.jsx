import React, { useState, useEffect, useCallback } from 'react';
import { NavLink, Link } from 'react-router-dom';
import voxShieldMark from '../assets/voxshield-mark.svg';
import { useAuth } from '../context/AuthContext';

export default function Sidebar({
  isCollapsed,
  onToggleCollapse,
  width = 260,
  setWidth,
  isResizing,
  setIsResizing
}) {
  const { user, authenticated, openAuthModal, logout } = useAuth();

  const startResizing = useCallback((e) => {
    e.preventDefault();
    if (setIsResizing) setIsResizing(true);
  }, [setIsResizing]);

  const stopResizing = useCallback(() => {
    if (setIsResizing) setIsResizing(false);
  }, [setIsResizing]);

  const resize = useCallback(
    (e) => {
      if (isResizing && setWidth) {
        let newWidth = e.clientX;
        if (newWidth < 140) {
          if (!isCollapsed && onToggleCollapse) onToggleCollapse();
        } else {
          if (isCollapsed && onToggleCollapse) onToggleCollapse();
          if (newWidth < 180) newWidth = 180;
          if (newWidth > 480) newWidth = 480;
          setWidth(newWidth);
          try {
            localStorage.setItem('voxshield_sidebar_width', newWidth.toString());
          } catch (_) {}
        }
      }
    },
    [isResizing, isCollapsed, onToggleCollapse, setWidth]
  );

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup', stopResizing);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, resize, stopResizing]);

  const navItems = [
    {
      to: '/',
      label: 'Overview',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7"></rect>
          <rect x="14" y="3" width="7" height="7"></rect>
          <rect x="14" y="14" width="7" height="7"></rect>
          <rect x="3" y="14" width="7" height="7"></rect>
        </svg>
      )
    },
    {
      to: '/scanner',
      label: 'Threat Scanner',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
      )
    },
    {
      to: '/guardian-offline',
      label: 'Offline Threat Shield',
      badge: 'AIR-GAP',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
        </svg>
      )
    },
    {
      to: '/live',
      label: 'Live Call Shield',
      badge: 'LIVE',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          <path d="M12 8v4M12 16h.01"/>
        </svg>
      )
    },
    {
      to: '/speaker-guard',
      label: 'Voice ID Guard',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
      )
    },
    {
      to: '/history',
      label: 'Audit Logs & SIEM',
      badge: 'SIEM',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
          <polyline points="10 9 9 9 8 9"/>
        </svg>
      )
    }
  ];

  const devItems = [
    {
      to: '/api-keys',
      label: 'API Keys & Integration',
      badge: 'DEV',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 2l-2 2m-1-1l-3 3m0 0l-2-2-4 4 2 2-4 4 2 2-3 3M7 17l-4 4"/>
          <circle cx="17" cy="7" r="3"/>
        </svg>
      )
    },
    {
      to: '/about',
      label: 'Methodology & Docs',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 16v-4M12 8h.01"/>
        </svg>
      )
    }
  ];

  const currentSidebarWidth = isCollapsed ? 68 : width;

  return (
    <aside
      className={`cyber-sidebar ${isCollapsed ? 'collapsed' : 'expanded'} ${isResizing ? 'is-resizing' : ''}`}
      style={{
        width: `${currentSidebarWidth}px`,
        transition: isResizing ? 'none' : 'width 0.22s cubic-bezier(0.16, 1, 0.3, 1), padding 0.22s ease'
      }}
    >
      {/* Sidebar Header / Brand */}
      <div className="cyber-sidebar-header">
        <Link to="/" className="sidebar-brand-link" title="VoxShield Home">
          <div className="sidebar-brand-icon">
            <img src={voxShieldMark} alt="VoxShield" />
          </div>
          {!isCollapsed && (
            <div className="sidebar-brand-text">
              <span className="brand-name">VOXSHIELD</span>
              <span className="brand-tag">CYBER SEC OPS</span>
            </div>
          )}
        </Link>
        <button
          className="sidebar-collapse-toggle"
          onClick={onToggleCollapse}
          title={isCollapsed ? 'Open Sidebar (Ctrl + B)' : 'Close Sidebar (Ctrl + B)'}
          aria-label="Toggle Sidebar"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            {isCollapsed ? (
              <polyline points="9 18 15 12 9 6" />
            ) : (
              <polyline points="15 18 9 12 15 6" />
            )}
          </svg>
        </button>
      </div>

      {/* Navigation Sections */}
      <div className="cyber-sidebar-content">
        {/* Operations Group */}
        <div className="sidebar-nav-group">
          {!isCollapsed && <div className="sidebar-group-title">SECURITY OPERATIONS</div>}
          <nav className="sidebar-nav-list">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}
                title={isCollapsed ? item.label : undefined}
              >
                <span className="sidebar-item-icon">{item.icon}</span>
                {!isCollapsed && <span className="sidebar-item-label">{item.label}</span>}
                {!isCollapsed && item.badge && (
                  <span className={`sidebar-badge badge-${item.badge.toLowerCase()}`}>
                    {item.badge}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* Developer Integration Group */}
        <div className="sidebar-nav-group">
          {!isCollapsed && <div className="sidebar-group-title">DEVELOPER & EXTERNAL LAYER</div>}
          <nav className="sidebar-nav-list">
            {devItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}
                title={isCollapsed ? item.label : undefined}
              >
                <span className="sidebar-item-icon">{item.icon}</span>
                {!isCollapsed && <span className="sidebar-item-label">{item.label}</span>}
                {!isCollapsed && item.badge && (
                  <span className={`sidebar-badge badge-${item.badge.toLowerCase()}`}>
                    {item.badge}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
        </div>
      </div>

      {/* Sidebar Footer / User Account Controls */}
      <div className="cyber-sidebar-footer">
        {authenticated ? (
          <div className="sidebar-user-card" title={user?.email}>
            <div className="sidebar-user-avatar">
              {(user?.name?.trim()?.[0] || user?.email?.[0] || 'U').toUpperCase()}
            </div>
            {!isCollapsed && (
              <div className="sidebar-user-meta">
                <div className="sidebar-user-name">{user?.name || 'Verified User'}</div>
                <div className="sidebar-user-email">{user?.email}</div>
                <div className="sidebar-user-badge">SECURITY VERIFIED</div>
              </div>
            )}
            {!isCollapsed && (
              <button
                className="sidebar-logout-btn"
                onClick={logout}
                title="Log out of session"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                  <polyline points="16 17 21 12 16 7"/>
                  <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
              </button>
            )}
          </div>
        ) : (
          <button
            className={`sidebar-login-btn ${isCollapsed ? 'collapsed-btn' : ''}`}
            onClick={openAuthModal}
            title="Sign In / Register to VoiceShield"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
              <polyline points="10 17 15 12 10 7"/>
              <line x1="15" y1="12" x2="3" y2="12"/>
            </svg>
            {!isCollapsed && <span>SIGN IN / ENROLL</span>}
          </button>
        )}
      </div>

      {/* Resizable Drag Handle on Right Border */}
      {!isCollapsed && (
        <div
          className={`sidebar-resize-handle ${isResizing ? 'resizing' : ''}`}
          onMouseDown={startResizing}
          onDoubleClick={() => {
            if (setWidth) {
              setWidth(260);
              try {
                localStorage.setItem('voxshield_sidebar_width', '260');
              } catch (_) {}
            }
          }}
          title="Drag to resize sidebar (Double-click to reset to default)"
        >
          <div className="resize-handle-glow" />
        </div>
      )}
    </aside>
  );
}

