import React, { useState } from 'react';
import './LandingPage.css';

const LandingPage = ({ onJoin, nickname, setNickname, adminKey, setAdminKey, authRequired, totalUnits }) => {
    const [step, setStep] = useState(0);

    const nextStep = () => setStep(prev => Math.min(prev + 1, 2));
    const prevStep = () => setStep(prev => Math.max(prev - 1, 0));

    return (
        <div className={`landing-container step-${step}`}>
            {/* BACKGROUND DECOR */}
            <div className="landing-bg-overlay"></div>
            
            {/* NAVIGATION DOTS */}
            <div className="landing-nav">
                {[0, 1, 2].map(i => (
                    <div 
                        key={i} 
                        className={`nav-dot ${step === i ? 'active' : ''}`} 
                        onClick={() => setStep(i)}
                    />
                ))}
            </div>

            {/* SECTION 1: HERO */}
            <section className={`landing-section hero ${step === 0 ? 'active' : ''}`}>
                <div className="content">
                    <div className="status-badge-mini">
                        <span className="pulse-dot"></span> {totalUnits || 25} PILOTS ACTIVE IN SECTOR
                    </div>
                    <h1>ВЫЖИВАЙ.<br/>ДОСТАВЛЯЙ.<br/>ЗАРАБАТЫВАЙ.</h1>
                    <p className="sub-description">
                        Добывай токены $CMKZ, доставляя критически важные узлы сети Solana через пустоши Алатау. 
                        Защищай груз, строй экономику.
                    </p>
                    <button className="cta-button" onClick={nextStep}>УЗНАТЬ БОЛЬШЕ</button>
                </div>
            </section>

            {/* SECTION 2: MECHANICS */}
            <section className={`landing-section mechanics ${step === 1 ? 'active' : ''}`}>
                <div className="content">
                    <h2>ПРОТОКОЛ МИССИИ</h2>
                    <div className="mechanics-grid">
                        <div className="mech-card">
                            <div className="mech-icon">📦</div>
                            <h3>ДОБЫВАЙ</h3>
                            <p>Забирай валидатор-ноды Solana в депо «Байконур» и вези их в город.</p>
                        </div>
                        <div className="mech-card highlight">
                            <div className="mech-icon">🔫</div>
                            <h3>ЗАЩИЩАЙ</h3>
                            <p>Конкуренты попытаются украсть твой груз. Используй лазеры для защиты.</p>
                        </div>
                        <div className="mech-card">
                            <div className="mech-icon">💰</div>
                            <h3>ЗАРАБАТЫВАЙ</h3>
                            <p>Каждая доставка конвертируется в $CMKZ. Твой баланс — твой будущий капитал.</p>
                        </div>
                    </div>
                    <div className="action-buttons">
                        <button className="secondary-button" onClick={prevStep}>НАЗАД</button>
                        <button className="cta-button" onClick={nextStep}>К ЗАПУСКУ</button>
                    </div>
                </div>
            </section>

            {/* SECTION 3: LOGIN */}
            <section className={`landing-section login-zone ${step === 2 ? 'active' : ''}`}>
                <div className="content">
                    <h2>ФАЗА: GENESIS</h2>
                    <p className="vision-text">
                        Все накопленные активы будут учтены при запуске основной сети и ликвидности. 
                        Стань ранним пилотом системы сегодня.
                    </p>
                    
                    <div className="login-form-box">
                        <input 
                            type="text" 
                            placeholder="ВВЕДИТЕ ПОЗЫВНОЙ..." 
                            maxLength={15}
                            value={nickname}
                            onChange={(e) => setNickname(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && onJoin()}
                        />
                        {(nickname.trim().toLowerCase() === 'admin' || authRequired) && (
                            <input 
                                type="password" 
                                placeholder={authRequired ? "ACCESS ID..." : "SECRET KEY..."} 
                                value={adminKey}
                                onChange={(e) => setAdminKey(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && onJoin()}
                                className="admin-input-fade"
                            />
                        )}
                        <button className="start-btn" onClick={onJoin}>ЗАПУСТИТЬ ДВИГАТЕЛЬ</button>
                    </div>
                    
                    <div className="social-links">
                        <a href="https://threads.net" target="_blank" rel="noreferrer" className="social-btn threads">THREADS</a>
                        <a href="#" className="social-btn telegram">TELEGRAM</a>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default LandingPage;
