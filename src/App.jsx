import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import './index.css';
import './App.css';

function App() {
  const [role, setRole] = useState(localStorage.getItem('nkstore-role') || null);
  const [pin, setPin] = useState('');
  
  const [lots, setLots] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  const [activeTab, setActiveTab] = useState('stock'); // default tab

  // Load Data
  const loadData = async () => {
    if (!role) return;
    setLoading(true);
    
    // Fetch Lots & Models
    const { data: lotsData, error: lotsError } = await supabase
      .from('lots')
      .select('*, models(*)');
      
    if (lotsData) {
      setLots(lotsData);
    }
    
    // Fetch Logs only for Admin
    if (role === 'ADMIN') {
      const { data: logsData } = await supabase
        .from('logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (logsData) setLogs(logsData);
    }
    
    setLoading(false);
  };

  useEffect(() => {
    loadData();
    // Setup real-time listeners
    const channel = supabase.channel('schema-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'models' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lots' }, () => loadData())
      .subscribe();
      
    return () => { supabase.removeChannel(channel) };
  }, [role]);

  // Log Action Helper
  const logAction = async (action_type, description) => {
    await supabase.from('logs').insert([{
      action_type,
      description,
      author: role
    }]);
  };

  // Login
  if (!role) {
    return (
      <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-color)', color: 'white'}}>
        <h1 style={{fontSize: '3rem', marginBottom: '1rem'}}>NK'STORE</h1>
        <p style={{color: 'var(--text-secondary)', marginBottom: '3rem'}}>Sélectionnez votre profil pour continuer</p>
        
        <div style={{display: 'flex', gap: '2rem', flexWrap: 'wrap', justifyContent: 'center'}}>
          {/* VENDEUSE */}
          <div className="glass-panel" style={{textAlign: 'center', width: '300px'}}>
            <h2>👩‍💼 Vendeuse</h2>
            <p style={{fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '2rem'}}>Accès limité à la gestion du stock et aux nouveaux arrivages.</p>
            <button 
              onClick={() => { setRole('VENDEUSE'); localStorage.setItem('nkstore-role', 'VENDEUSE'); setActiveTab('stock'); }}
              style={{width: '100%', padding: '1rem', background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 'bold'}}
            >
              Connexion Libre
            </button>
          </div>

          {/* ADMIN */}
          <div className="glass-panel" style={{textAlign: 'center', width: '300px', borderTop: '4px solid var(--danger-color)'}}>
            <h2>👑 Administrateur</h2>
            <p style={{fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1rem'}}>Accès complet (Bénéfices, Dépenses, Historique).</p>
            <input 
              type="password" 
              placeholder="Code PIN Secret" 
              value={pin} 
              onChange={(e) => setPin(e.target.value)}
              style={{width: '100%', padding: '0.75rem', marginBottom: '1rem', textAlign: 'center', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--surface-border)', color: 'white', borderRadius: '0.5rem'}}
            />
            <button 
              onClick={() => {
                if(pin === 'nkstore@2025.tris@') { 
                  setRole('ADMIN'); 
                  localStorage.setItem('nkstore-role', 'ADMIN'); 
                  setActiveTab('dashboard');
                } else { 
                  alert('Code PIN incorrect !'); 
                }
              }}
              style={{width: '100%', padding: '1rem', background: 'var(--danger-color)', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 'bold'}}
            >
              Connexion Sécurisée
            </button>
          </div>
        </div>
      </div>
    );
  }

  const formatFCFA = (amount) => Math.round(amount).toLocaleString('fr-FR') + ' FCFA';

  const handleLogout = () => {
    setRole(null);
    setPin('');
    localStorage.removeItem('nkstore-role');
  };

  // --- ACTIONS ---

  // 1. ADD LOT
  const [newLotName, setNewLotName] = useState('');
  const [newModels, setNewModels] = useState([{ id: Date.now(), name: '', quantity: '1', buyPrice: '', sellPrice: '' }]);

  const updateNewModel = (id, field, value) => {
    setNewModels(newModels.map(m => m.id === id ? { ...m, [field]: value } : m));
  };

  const createLot = async () => {
    if (!newLotName) return alert("Veuillez donner un nom à l'article !");
    
    // Créer le lot
    const { data: lotData, error: lotError } = await supabase
      .from('lots')
      .insert([{ name: newLotName }])
      .select();
      
    if (lotError || !lotData) {
      console.error(lotError);
      return alert("Erreur lors de la création de l'arrivage.");
    }

    const lotId = lotData[0].id;

    // Créer les modèles
    const modelsToInsert = newModels.map(m => ({
      lot_id: lotId,
      name: m.name,
      quantity: parseInt(m.quantity) || 0,
      sold_quantity: 0,
      buy_price: parseFloat(m.buyPrice) || 0,
      sell_price: parseFloat(m.sellPrice) || 0
    }));

    await supabase.from('models').insert(modelsToInsert);
    await logAction('AJOUT', `Arrivage créé : ${newLotName} (${newModels.length} modèles)`);

    setNewLotName('');
    setNewModels([{ id: Date.now(), name: '', quantity: '1', buyPrice: '', sellPrice: '' }]);
    alert("Arrivage sauvegardé avec succès !");
    loadData();
    setActiveTab('stock');
  };

  // 2. STOCK UPDATE
  const [selectedStockLotId, setSelectedStockLotId] = useState('');
  const updateStock = async (lotId, modelId, modelName, lotName, currentSold, maxQty, change) => {
    let newSold = currentSold + change;
    if (newSold < 0) newSold = 0;
    if (newSold > maxQty) newSold = maxQty;
    if (newSold === currentSold) return;

    // Update DB optimistically? We'll just wait
    await supabase.from('models').update({ sold_quantity: newSold }).eq('id', modelId);
    
    const actionDesc = change > 0 
      ? `Vente : 1x ${modelName} (${lotName})`
      : `Annulation vente : -1x ${modelName} (${lotName})`;
      
    await logAction('VENTE', actionDesc);
    loadData(); // refresh UI
  };

  // 3. EXPENSES UPDATE (ADMIN ONLY)
  const [selectedLotIdExp, setSelectedLotIdExp] = useState('');
  const [expensesForm, setExpensesForm] = useState({ customs: '', ads: '', transport: '', other: '' });

  const loadExpensesToForm = (lotId) => {
    setSelectedLotIdExp(lotId);
    const lot = lots.find(l => l.id === lotId);
    if (lot) {
      setExpensesForm({ customs: lot.customs || '', ads: lot.ads || '', transport: lot.transport || '', other: lot.other || '' });
    }
  };

  const updateExpenses = async () => {
    if (!selectedLotIdExp) return;
    const lot = lots.find(l => l.id === selectedLotIdExp);
    
    await supabase.from('lots').update({
      customs: parseFloat(expensesForm.customs) || 0,
      ads: parseFloat(expensesForm.ads) || 0,
      transport: parseFloat(expensesForm.transport) || 0,
      other: parseFloat(expensesForm.other) || 0
    }).eq('id', selectedLotIdExp);

    await logAction('DEPENSE', `Dépenses mises à jour pour : ${lot.name}`);
    alert("Dépenses enregistrées !");
    loadData();
    setActiveTab('dashboard');
  };

  // 3.5 EDIT BUY PRICES (ADMIN ONLY)
  const [selectedLotIdPrice, setSelectedLotIdPrice] = useState('');
  const [editPrices, setEditPrices] = useState({});

  const loadPricesToForm = (lotId) => {
    setSelectedLotIdPrice(lotId);
    const lot = lots.find(l => l.id === lotId);
    if (lot && lot.models) {
      const p = {};
      lot.models.forEach(m => p[m.id] = m.buy_price || 0);
      setEditPrices(p);
    }
  };

  const saveBuyPrices = async () => {
    if (!selectedLotIdPrice) return;
    const lot = lots.find(l => l.id === selectedLotIdPrice);
    
    await Promise.all(
      Object.keys(editPrices).map(async (modelId) => {
         await supabase.from('models').update({ buy_price: parseFloat(editPrices[modelId]) || 0 }).eq('id', modelId);
      })
    );

    await logAction('MODIFICATION', `Prix d'achat complétés pour l'arrivage : ${lot.name}`);
    alert("Prix d'achat enregistrés !");
    loadData();
    setActiveTab('dashboard');
  };

  // 4. DELETE LOT (ADMIN ONLY)
  const deleteLot = async (id, name) => {
    if (window.confirm("Supprimer cet arrivage ?")) {
      await supabase.from('lots').delete().eq('id', id);
      await logAction('SUPPRESSION', `Arrivage supprimé : ${name}`);
      loadData();
    }
  };

  return (
    <div className="app-layout">
      {/* SIDEBAR */}
      <nav className="sidebar no-print">
        <div className="brand" style={{display: 'flex', flexDirection: 'column'}}>
          <span>NK'<span style={{color:'var(--accent-color)'}}>STORE</span></span>
          <span style={{fontSize: '0.8rem', color: role === 'ADMIN' ? 'var(--danger-color)' : 'var(--text-secondary)', fontWeight: 'normal', marginTop:'5px'}}>
            Connecté en : {role === 'ADMIN' ? 'Admin 👑' : 'Vendeuse 👩‍💼'}
          </span>
        </div>
        <ul>
          {role === 'ADMIN' && (
            <li className={activeTab === 'dashboard' ? 'active' : ''} onClick={() => setActiveTab('dashboard')}>
              📊 Tableau de Bord
            </li>
          )}
          <li className={activeTab === 'stock' ? 'active' : ''} onClick={() => setActiveTab('stock')}>
            🛒 Gérer le Stock
          </li>
          <li className={activeTab === 'add-lot' ? 'active' : ''} onClick={() => setActiveTab('add-lot')}>
            📦 Nouvel Arrivage
          </li>
          {role === 'ADMIN' && (
            <li className={activeTab === 'expenses' ? 'active' : ''} onClick={() => setActiveTab('expenses')}>
              💸 Gérer les Dépenses
            </li>
          )}
          {role === 'ADMIN' && (
            <li className={activeTab === 'buy-prices' ? 'active' : ''} onClick={() => setActiveTab('buy-prices')}>
              🏷️ Prix d'Achat (Chine)
            </li>
          )}
          {role === 'ADMIN' && (
            <li className={activeTab === 'logs' ? 'active' : ''} onClick={() => setActiveTab('logs')}>
              📝 Historique (Logs)
            </li>
          )}
        </ul>

        <button onClick={handleLogout} style={{marginTop: 'auto', background: 'transparent', border: '1px solid var(--danger-color)', color: 'var(--danger-color)', padding: '0.75rem', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 'bold'}}>
          Déconnexion
        </button>
      </nav>

      {/* MAIN CONTENT */}
      <main className="main-content">
        
        {loading && <div style={{position: 'fixed', top: '10px', right: '10px', background: 'var(--accent-color)', padding: '5px 10px', borderRadius: '5px'}}>Mise à jour en cours...</div>}

        {/* --- VUE: TABLEAU DE BORD (ADMIN SEUL) --- */}
        {role === 'ADMIN' && (
          <div className={`view-section ${activeTab !== 'dashboard' ? 'hidden-screen' : ''}`}>
            <header className="no-print" style={{marginBottom: '2rem'}}>
              <h1>Tableau de Rentabilité Avancé</h1>
              <p style={{color: 'var(--text-secondary)'}}>Vue globale et confidentielle de vos marges.</p>
            </header>

            <div className="glass-panel">
              <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem'}}>
                {lots.map(lot => {
                  const totalRevenue = lot.models?.reduce((sum, m) => sum + (m.quantity * m.sell_price), 0) || 0;
                  const totalBuyCost = lot.models?.reduce((sum, m) => sum + (m.quantity * m.buy_price), 0) || 0;
                  const totalGlobalExp = (lot.customs || 0) + (lot.ads || 0) + (lot.transport || 0) + (lot.other || 0);
                  const totalExpenses = totalBuyCost + totalGlobalExp;
                  const netProfit = totalRevenue - totalExpenses;
                  
                  const totalInitialStock = lot.models?.reduce((sum, m) => sum + m.quantity, 0) || 0;
                  const totalSoldStock = lot.models?.reduce((sum, m) => sum + (m.sold_quantity || 0), 0) || 0;
                  const remainingStock = totalInitialStock - totalSoldStock;
                  
                  return (
                    <div key={lot.id} style={{background: 'rgba(255,255,255,0.05)', border: '1px solid var(--surface-border)', padding: '1.5rem', borderRadius: '0.75rem', position: 'relative'}}>
                       <button className="no-print danger" onClick={() => deleteLot(lot.id, lot.name)} style={{position: 'absolute', top: '10px', right: '10px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.2rem'}}>✕</button>
                       
                       <h3 style={{fontSize: '1.4rem', marginBottom: '0.5rem', color: 'white'}}>{lot.name}</h3>
                       
                       <div style={{display: 'inline-block', background: 'var(--accent-color)', color: 'white', padding: '0.25rem 0.75rem', borderRadius: '1rem', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '1.5rem'}}>
                         📦 Stock: {remainingStock} restant(s) sur {totalInitialStock}
                       </div>
                       
                       <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', fontSize: '1.05rem'}}>
                         <span>Chiffre d'Affaires Prévu:</span>
                         <span style={{color: 'var(--success-color)', fontWeight: 'bold'}}>{formatFCFA(totalRevenue)}</span>
                       </div>
                       
                       <div style={{background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '0.5rem', marginBottom: '1.5rem'}}>
                         <div style={{fontWeight: 'bold', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)'}}>DÉTAIL DES DÉPENSES</div>
                         <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem'}}><span>Achat Chine:</span><span style={{color: 'var(--danger-color)'}}>-{formatFCFA(totalBuyCost)}</span></div>
                         <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem'}}><span>Douane:</span><span style={{color: 'var(--danger-color)'}}>-{formatFCFA(lot.customs)}</span></div>
                         <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', borderTop: '1px dashed rgba(255,255,255,0.2)', marginTop:'5px', paddingTop:'5px'}}>
                           <strong>TOTAL DÉPENSÉ:</strong><strong style={{color: 'var(--danger-color)'}}>-{formatFCFA(totalExpenses)}</strong>
                         </div>
                       </div>
                       
                       <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '1.25rem', fontWeight: 'bold'}}>
                         <span>BÉNÉFICE NET:</span>
                         <span style={{color: netProfit >= 0 ? 'var(--success-color)' : 'var(--danger-color)'}}>{formatFCFA(netProfit)}</span>
                       </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* --- VUE: GESTION STOCK (ADMIN + VENDEUSE) --- */}
        <div className={`view-section ${activeTab !== 'stock' ? 'hidden-screen' : ''}`}>
          <header style={{marginBottom: '2rem'}}>
            <h1 style={{margin: 0}}>Gestion du Stock & Ventes</h1>
            <p style={{color: 'var(--text-secondary)'}}>Enregistrez les ventes au quotidien.</p>
          </header>

          <div className="glass-panel" style={{borderTop: '4px solid var(--accent-color)'}}>
            <select value={selectedStockLotId} onChange={(e) => setSelectedStockLotId(e.target.value)} style={{width: '100%', padding: '1rem', borderRadius: '0.5rem', background: 'var(--bg-color)', border: '1px solid var(--accent-color)', color: 'white', fontSize: '1.1rem', cursor: 'pointer', marginBottom: '1.5rem'}}>
              <option value="">-- Sélectionnez un article vendu --</option>
              {lots.map(lot => <option key={lot.id} value={lot.id}>{lot.name}</option>)}
            </select>

            {selectedStockLotId && (
              <table className="excel-table">
                <thead>
                  <tr>
                    <th>Modèle</th>
                    <th style={{textAlign: 'center'}}>Stock Actuel</th>
                    <th style={{textAlign: 'center'}}>Prix Vente</th>
                    <th style={{textAlign: 'center'}}>Action Vente</th>
                  </tr>
                </thead>
                <tbody>
                  {lots.find(l => l.id === selectedStockLotId)?.models?.map((model) => {
                    const remain = model.quantity - model.sold_quantity;
                    return (
                      <tr key={model.id}>
                        <td style={{fontWeight: 'bold', fontSize: '1.1rem'}}>{model.name}</td>
                        <td style={{textAlign: 'center'}}>
                          <span style={{display: 'inline-block', padding: '0.5rem', borderRadius: '0.5rem', fontWeight: 'bold', background: remain > 0 ? 'var(--success-color)' : 'var(--danger-color)', color: 'white'}}>
                            {remain} restants
                          </span>
                        </td>
                        <td style={{textAlign: 'center', color: 'var(--success-color)', fontWeight: 'bold'}}>{formatFCFA(model.sell_price)}</td>
                        <td style={{textAlign: 'center'}}>
                          <div style={{display: 'flex', justifyContent: 'center', gap: '1rem'}}>
                            <button 
                              onClick={() => updateStock(selectedStockLotId, model.id, model.name, lots.find(l => l.id === selectedStockLotId).name, model.sold_quantity, model.quantity, 1)}
                              disabled={remain === 0}
                              style={{padding: '0.75rem', background: remain===0?'rgba(255,255,255,0.1)':'var(--accent-color)', border: 'none', color: 'white', borderRadius: '0.5rem', cursor: remain===0?'not-allowed':'pointer', fontWeight: 'bold'}}
                            >
                              🛒 +1 Vente
                            </button>
                            {model.sold_quantity > 0 && (
                              <button onClick={() => updateStock(selectedStockLotId, model.id, model.name, lots.find(l => l.id === selectedStockLotId).name, model.sold_quantity, model.quantity, -1)} style={{padding: '0.5rem', background: 'transparent', border: '1px solid var(--danger-color)', color: 'var(--danger-color)', borderRadius: '0.25rem', cursor: 'pointer'}}>
                                Annuler (-1)
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* --- VUE: NOUVEL ARRIVAGE (ADMIN + VENDEUSE BRIDEE) --- */}
        <div className={`view-section ${activeTab !== 'add-lot' ? 'hidden-screen' : ''}`}>
          <header style={{marginBottom: '2rem'}}>
            <h1>Nouvel Arrivage</h1>
            <p style={{color: 'var(--text-secondary)'}}>Enregistrez une nouvelle commande.</p>
          </header>

          <div className="glass-panel">
            <input type="text" placeholder="Nom de l'Article (Ex: Lunettes Soleil)" value={newLotName} onChange={(e) => setNewLotName(e.target.value)} style={{width: '100%', padding: '1rem', borderRadius: '0.5rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--surface-border)', color: 'white', marginBottom: '1.5rem'}} />

            <table className="excel-table">
              <thead>
                <tr>
                  <th>Modèles (ex: Noir, Rouge)</th>
                  <th>Quantité</th>
                  {role === 'ADMIN' && <th>Achat U. (Chine)</th>}
                  <th>Revente U.</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {newModels.map((model) => (
                  <tr key={model.id}>
                    <td><input type="text" placeholder="Modèle..." value={model.name} onChange={(e) => updateNewModel(model.id, 'name', e.target.value)} /></td>
                    <td><input type="number" min="1" value={model.quantity} onChange={(e) => updateNewModel(model.id, 'quantity', e.target.value)} /></td>
                    {role === 'ADMIN' && <td><input type="number" placeholder="Achat" value={model.buyPrice} onChange={(e) => updateNewModel(model.id, 'buyPrice', e.target.value)} /></td>}
                    <td><input type="number" placeholder="Vente" value={model.sellPrice} onChange={(e) => updateNewModel(model.id, 'sellPrice', e.target.value)} /></td>
                    <td><button className="danger" onClick={() => { setNewModels(newModels.filter(m => m.id !== model.id)) }} style={{padding:'5px', background:'transparent', border:'none', color:'red', cursor:'pointer'}}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={() => setNewModels([...newModels, { id: Date.now(), name: '', quantity: '1', buyPrice: '', sellPrice: '' }])} style={{width: '100%', marginTop: '1rem', padding: '0.75rem', background: 'transparent', color: 'var(--accent-color)', border: '1px dashed var(--accent-color)'}}>+ Ajouter un autre modèle</button>
            <button onClick={createLot} style={{width: '100%', padding: '1rem', marginTop: '1.5rem', background: 'var(--success-color)', color: 'white', fontWeight: 'bold', border: 'none', borderRadius: '0.5rem', cursor:'pointer'}}>✓ Sauvegarder cet Article</button>
          </div>
        </div>

        {/* --- VUE: DEPENSES (ADMIN SEUL) --- */}
        {role === 'ADMIN' && (
          <div className={`view-section ${activeTab !== 'expenses' ? 'hidden-screen' : ''}`}>
             <header style={{marginBottom: '2rem'}}>
              <h1>Gestion des Dépenses</h1>
            </header>
            <div className="glass-panel">
              <select value={selectedLotIdExp} onChange={(e) => loadExpensesToForm(e.target.value)} style={{width: '100%', padding: '1rem', borderRadius: '0.5rem', background: 'var(--bg-color)', border: '1px solid var(--accent-color)', color: 'white', marginBottom: '1.5rem'}}>
                <option value="">-- Sélectionnez un article --</option>
                {lots.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              {selectedLotIdExp && (
                <div className="expenses-grid">
                  <div className="expense-input-group"><label>Douane</label><input type="number" value={expensesForm.customs} onChange={(e) => setExpensesForm({...expensesForm, customs: e.target.value})} /></div>
                  <div className="expense-input-group"><label>Transport</label><input type="number" value={expensesForm.transport} onChange={(e) => setExpensesForm({...expensesForm, transport: e.target.value})} /></div>
                  <div className="expense-input-group"><label>Pub</label><input type="number" value={expensesForm.ads} onChange={(e) => setExpensesForm({...expensesForm, ads: e.target.value})} /></div>
                  <div className="expense-input-group"><label>Autres</label><input type="number" value={expensesForm.other} onChange={(e) => setExpensesForm({...expensesForm, other: e.target.value})} /></div>
                </div>
              )}
              <button onClick={updateExpenses} disabled={!selectedLotIdExp} style={{width: '100%', padding: '1rem', marginTop: '1.5rem', background: selectedLotIdExp ? 'var(--accent-color)' : 'grey', color: 'white', border: 'none', borderRadius: '0.5rem', cursor:'pointer'}}>Enregistrer les Dépenses</button>
            </div>
          </div>
        )}

        {/* --- VUE: COMPLÉTER PRIX ACHAT (ADMIN SEUL) --- */}
        {role === 'ADMIN' && (
          <div className={`view-section ${activeTab !== 'buy-prices' ? 'hidden-screen' : ''}`}>
             <header style={{marginBottom: '2rem'}}>
              <h1>Compléter les Prix d'Achat</h1>
              <p style={{color: 'var(--text-secondary)'}}>Remplissez le prix d'achat en Chine pour les arrivages créés par les vendeuses.</p>
            </header>
            <div className="glass-panel">
              <select value={selectedLotIdPrice} onChange={(e) => loadPricesToForm(e.target.value)} style={{width: '100%', padding: '1rem', borderRadius: '0.5rem', background: 'var(--bg-color)', border: '1px solid var(--accent-color)', color: 'white', marginBottom: '1.5rem', cursor: 'pointer'}}>
                <option value="">-- Sélectionnez un arrivage --</option>
                {lots.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              
              {selectedLotIdPrice && lots.find(l => l.id === selectedLotIdPrice)?.models && (
                <table className="excel-table">
                  <thead>
                    <tr>
                      <th style={{width: '50%'}}>Modèle</th>
                      <th>Prix d'Achat Unitaire (Chine)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lots.find(l => l.id === selectedLotIdPrice).models.map(m => (
                      <tr key={m.id}>
                        <td style={{fontWeight: 'bold', fontSize: '1.1rem'}}>{m.name}</td>
                        <td>
                          <input 
                            type="number" 
                            placeholder="Ex: 1500" 
                            value={editPrices[m.id] === undefined ? '' : editPrices[m.id]} 
                            onChange={(e) => setEditPrices({...editPrices, [m.id]: e.target.value})} 
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              
              <button onClick={saveBuyPrices} disabled={!selectedLotIdPrice} style={{width: '100%', padding: '1rem', marginTop: '1.5rem', background: selectedLotIdPrice ? 'var(--accent-color)' : 'grey', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: selectedLotIdPrice ? 'pointer' : 'not-allowed', fontWeight: 'bold'}}>
                Enregistrer les Prix d'Achat
              </button>
            </div>
          </div>
        )}

        {/* --- VUE: LOGS (ADMIN SEUL) --- */}
        {role === 'ADMIN' && (
          <div className={`view-section ${activeTab !== 'logs' ? 'hidden-screen' : ''}`}>
             <header style={{marginBottom: '2rem'}}>
              <h1>Historique des Mouvements</h1>
              <p style={{color: 'var(--text-secondary)'}}>Suivez toutes les actions réalisées en boutique.</p>
            </header>
            <div className="glass-panel" style={{maxHeight: '600px', overflowY: 'auto'}}>
              {logs.length === 0 ? <p>Aucun mouvement pour le moment.</p> : (
                <ul style={{listStyle: 'none', padding: 0}}>
                  {logs.map(log => (
                    <li key={log.id} style={{padding: '1rem', borderBottom: '1px solid var(--surface-border)', display: 'flex', flexDirection: 'column', gap: '0.25rem'}}>
                      <div style={{display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: '0.85rem'}}>
                        <span>{new Date(log.created_at).toLocaleString('fr-FR')}</span>
                        <span style={{fontWeight: 'bold', color: log.author === 'ADMIN' ? 'var(--danger-color)' : 'var(--accent-color)'}}>{log.author}</span>
                      </div>
                      <strong style={{color: 'white', fontSize: '1.05rem'}}>[{log.action_type}] {log.description}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}

export default App;
