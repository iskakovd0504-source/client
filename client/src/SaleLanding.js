import React from 'react';
import './SaleLanding.css';

const SaleLanding = () => {
  const whatsappUrl = "https://wa.me/77775556789?text=%D0%97%D0%B4%D1%80%D0%B0%D0%B2%D1%81%D1%82%D0%B2%D1%83%D0%B9%D1%82%D0%B5!%20%D0%AF%20%D0%BF%D0%BE%20%D0%BF%D0%BE%D0%B2%D0%BE%D0%B4%D1%83%20%D0%B4%D0%BE%D0%BC%D0%B5%D0%BD%D0%BD%D0%BE%D0%B3%D0%BE%20%D0%B8%D0%BC%D0%B5%D0%BD%D0%B8%20cryptomarket.kz";

  return (
    <div className="sale-landing-container">
      {/* Background Animated Elements */}
      <div className="cyber-grid"></div>
      <div className="glow-orb orb-1"></div>
      <div className="glow-orb orb-2"></div>
      <div className="glow-orb orb-3"></div>

      <div className="sale-content-wrapper">
        {/* Header */}
        <header className="sale-header">
          <div className="logo-glow">
            <span className="logo-main">CRYPTOMARKET</span>
            <span className="logo-tld">.KZ</span>
          </div>
        </header>

        {/* Hero Section */}
        <section className="hero-section">
          <h1 className="hero-title">
            Доменное имя продается <br />
            <span className="highlight-text">или ищет стратегического партнера</span>
          </h1>
          <p className="hero-subtitle">
            Идеальный премиум-домен для запуска криптовалютной биржи, P2P-платформы, финтех-сервиса или Web3-проекта в Казахстане.
          </p>
          
          <div className="quick-actions">
            <a 
              href={whatsappUrl} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="wa-contact-btn"
              id="wa_button_hero"
            >
              <svg className="wa-icon" viewBox="0 0 24 24" width="24" height="24">
                <path fill="currentColor" d="M19.001 4.908A9.817 9.817 0 0 0 11.992 2C6.534 2 2.085 6.448 2.08 11.908c0 1.748.458 3.45 1.321 4.956L2 22l5.255-1.377a9.816 9.816 0 0 0 4.73 1.206h.005c5.454 0 9.905-4.447 9.91-9.908a9.84 9.84 0 0 0-2.899-7.013zM11.992 20.12a8.183 8.183 0 0 1-4.175-1.135l-.3-.179-3.102.813.827-3.025-.196-.312a8.188 8.188 0 0 1-1.252-4.373c.004-4.514 3.682-8.19 8.2-8.19a8.14 8.14 0 0 1 5.795 2.404 8.14 8.14 0 0 1 2.396 5.8c-.004 4.516-3.682 8.194-8.193 8.194zm4.493-6.143c-.246-.123-1.458-.72-1.684-.803-.226-.082-.39-.123-.555.123-.164.246-.636.802-.78.966-.143.164-.287.185-.533.061-.246-.123-1.039-.383-1.979-1.222-.73-.652-1.224-1.458-1.368-1.704-.143-.246-.015-.379.108-.501.112-.11.246-.288.37-.432.122-.144.163-.246.245-.411.082-.164.041-.308-.02-.431-.062-.124-.555-1.338-.76-1.832-.2-.482-.403-.418-.555-.426H8.66c-.164 0-.431.062-.656.308-.226.246-.863.843-.863 2.053 0 1.21.883 2.38 1.006 2.546.123.164 1.737 2.654 4.209 3.72.588.254 1.047.406 1.406.52.59.187 1.127.16 1.552.097.473-.072 1.458-.596 1.664-1.172.205-.576.205-1.07.143-1.172-.061-.103-.225-.164-.472-.287z" />
              </svg>
              <span>СВЯЗАТЬСЯ В WHATSAPP</span>
            </a>
          </div>
        </section>

        {/* Feature Grid */}
        <section className="features-section">
          <h2 className="section-title">Преимущества предложения:</h2>
          <div className="features-grid">
            <div className="feature-card">
              <div className="card-icon">👑</div>
              <h3>Премиальный домен</h3>
              <p>Звучное, авторитетное и легко запоминающееся имя в национальной зоне .kz, идеально подходящее под любой масштабный крипто-стартап.</p>
            </div>
            
            <div className="feature-card">
              <div className="card-icon">💳</div>
              <h3>P2P и Финтех</h3>
              <p>Идеальный бренд для запуска криптовалютного обменника, P2P-платформы, фиатного шлюза или локального платежного сервиса.</p>
            </div>

            <div className="feature-card">
              <div className="card-icon">📈</div>
              <h3>SEO-потенциал</h3>
              <p>Прямое ключевое слово "cryptomarket" отлично ранжируется поисковыми системами и вызывает мгновенное доверие у пользователей.</p>
            </div>

            <div className="feature-card">
              <div className="card-icon">🎨</div>
              <h3>Готовый бренд</h3>
              <p>Яркое название, которое легко ложится на логотипы, мерч и рекламные креативы, значительно экономя маркетинговый бюджет.</p>
            </div>

            <div className="feature-card">
              <div className="card-icon">🔒</div>
              <h3>Безопасная сделка</h3>
              <p>Официальное переоформление доменного имени через аккредитованного регистратора Республики Казахстан с полной юридической чистотой.</p>
            </div>

            <div className="feature-card highlight-card">
              <div className="card-icon">🤝</div>
              <h3>Стратегическое партнерство</h3>
              <p>Мы готовы рассмотреть как полную продажу доменного имени, так и различные варианты совместного запуска или инвестиций.</p>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="sale-footer">
          <p>© 2026 CryptoMarket.kz. Все права защищены.</p>
          <div className="footer-links">
            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">WhatsApp</a>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default SaleLanding;
