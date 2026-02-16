// SehawqDB React Hook ⚛️
// "The Local Firebase Experience"
// TODO: this is still rough, needs more testing with actual react apps

const { useState, useEffect } = require('react');
const Sehawq = require('./client');

// useSehawq — watches a key and gives you reactive state
function useSehawq(key, initialValue = null, dbInstance = null) {
    const db = dbInstance || (typeof window !== 'undefined' ? window.db : null);

    const [data, setData] = useState(initialValue);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // auth stuff
    const [token, setToken] = useState(
        (typeof localStorage !== 'undefined') ? localStorage.getItem('sehawq_token') : null
    );

    const login = async (username, password) => {
        if (!db) return false;
        try {
            const res = await db.login(username, password);
            if (res.token) {
                setToken(res.token);
                if (typeof localStorage !== 'undefined') {
                    localStorage.setItem('sehawq_token', res.token);
                }
                return true;
            }
        } catch (e) {
            console.error('login failed:', e);
        }
        return false;
    };

    const logout = () => {
        setToken(null);
        if (typeof localStorage !== 'undefined') localStorage.removeItem('sehawq_token');
    };

    useEffect(() => {
        if (!db) return;

        if (token) db.setToken(token);

        let alive = true; // track if component is still around

        // fetch initial value
        db.get(key)
            .then(val => {
                if (!alive) return;
                if (val !== undefined) setData(val);
                setLoading(false);
            })
            .catch(err => {
                if (!alive) return;
                setError(err);
                setLoading(false);
            });

        // realtime listener
        const onUpdate = (newVal) => {
            if (alive) setData(newVal);
        };
        db.on(key, onUpdate);

        return () => {
            alive = false;
            db.off(key, onUpdate);
        };
    }, [key, db, token]);

    // helper to push updates back to db
    const update = (newValue) => {
        if (!db) return;
        db.set(key, newValue).catch(e => setError(e));
    };

    return [data, update, { loading, error, login, logout, token }];
}

module.exports = useSehawq;
