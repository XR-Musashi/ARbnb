import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { api } from '../lib/api';

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [error, setError] = useState('');
  const [sessionMap, setSessionMap] = useState({});

  useEffect(() => {
    api.properties.list()
      .then(setProperties)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function createProperty(e) {
    e.preventDefault();
    setError('');
    try {
      const p = await api.properties.create({ name: newName, address: newAddress });
      setProperties((prev) => [p, ...prev]);
      setNewName('');
      setNewAddress('');
      setCreating(false);
    } catch (e) {
      setError(e.message);
    }
  }

  async function deleteProperty(id) {
    if (!confirm('Delete this property and all its annotations?')) return;
    await api.properties.delete(id);
    setProperties((prev) => prev.filter((p) => p.id !== id));
  }

  async function generateGuestLink(propertyId) {
    try {
      const session = await api.sessions.create(propertyId);
      setSessionMap((prev) => ({ ...prev, [propertyId]: session.guestToken }));
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">ARbnb</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">{user?.email}</span>
          <button onClick={signOut} className="text-sm text-gray-500 hover:text-gray-800">Sign out</button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-800">Your Properties</h2>
          <button
            onClick={() => setCreating(true)}
            className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
          >
            + New Property
          </button>
        </div>

        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

        {/* Create form */}
        {creating && (
          <form onSubmit={createProperty} className="bg-white border rounded-xl p-4 mb-4 space-y-3">
            <input
              autoFocus
              required
              placeholder="Property name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <input
              placeholder="Address (optional)"
              value={newAddress}
              onChange={(e) => setNewAddress(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <div className="flex gap-2">
              <button type="submit" className="bg-brand-600 text-white text-sm px-4 py-2 rounded-lg">Create</button>
              <button type="button" onClick={() => setCreating(false)} className="text-sm text-gray-500 px-4 py-2">Cancel</button>
            </div>
          </form>
        )}

        {/* Property list */}
        {loading ? (
          <p className="text-gray-400 text-sm">Loading…</p>
        ) : properties.length === 0 ? (
          <p className="text-gray-400 text-sm">No properties yet. Create one to get started.</p>
        ) : (
          <ul className="space-y-3">
            {properties.map((p) => (
              <li key={p.id} className="bg-white border rounded-xl p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-gray-800">{p.name}</p>
                    {p.address && <p className="text-sm text-gray-500">{p.address}</p>}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => navigate(`/properties/${p.id}/edit`)}
                      className="text-sm text-brand-600 hover:text-brand-700 font-medium"
                    >
                      Edit annotations
                    </button>
                    <button
                      onClick={() => deleteProperty(p.id)}
                      className="text-sm text-red-500 hover:text-red-700"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* Guest session token */}
                <div className="mt-3">
                  {sessionMap[p.id] ? (
                    <div className="bg-gray-50 rounded-lg p-2 text-xs font-mono break-all text-gray-600">
                      Guest token: {sessionMap[p.id]}
                    </div>
                  ) : (
                    <button
                      onClick={() => generateGuestLink(p.id)}
                      className="text-xs text-gray-500 hover:text-gray-700 underline"
                    >
                      Generate guest token
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
