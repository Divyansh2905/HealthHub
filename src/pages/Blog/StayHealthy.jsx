// src/pages/Blog/StayHealthy.jsx
import React, { useState, useEffect } from "react";
import Fuse from "fuse.js";
import {
  collection,
  addDoc,
  onSnapshot,
  serverTimestamp,
  doc,
  deleteDoc
} from "firebase/firestore";
import { db } from "../../firebase/config";
import { useAuth } from "../../hooks/useAuth";
import { useToast } from "../../components/ToastProvider";

const categories = ["All", "Health", "Awareness", "Preventive Tips", "Research"];

export default function StayHealthy() {
  const { user, profile } = useAuth();
  const { addToast } = useToast();

  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedBlog, setExpandedBlog] = useState(null);
  const [blogs, setBlogs] = useState([]);

  // form states
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [content, setContent] = useState("");
  const [links, setLinks] = useState("");
  const [category, setCategory] = useState("Health");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  // 🔹 Real-time fetch from Firestore
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "blogs"), (snapshot) => {
      setBlogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsub();
  }, []);

  // search memory
  useEffect(() => {
    const savedSearch = localStorage.getItem("searchTerm");
    if (savedSearch) setSearchTerm(savedSearch);
  }, []);
  useEffect(() => {
    localStorage.setItem("searchTerm", searchTerm);
  }, [searchTerm]);

  const fuse = new Fuse(blogs, {
    keys: ["title", "subtitle", "description", "category", "tags", "content"],
    threshold: 0.4,
  });

  // 🔹 filter + search
  let filteredBlogs =
    searchTerm.trim() !== ""
      ? fuse.search(searchTerm).map((result) => result.item)
      : blogs.filter(
          (blog) =>
            selectedCategory === "All" || blog.category === selectedCategory
        );

  // 🔹 Submit blog
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      addToast({ type: "error", title: "Validation Error", message: "Title required" });
      return;
    }
    if (content.length > 2000) {
      addToast({ type: "error", title: "Validation Error", message: "Content too long (max 2000)" });
      return;
    }

    // ✅ close form immediately & disable button
    setShowForm(false);
    setIsSubmitting(true);

    try {
      await addDoc(collection(db, "blogs"), {
        uid: user.uid,
        creatorRole: profile?.role || "citizen",
        category,
        title: title.trim(),
        subtitle: subtitle.trim() || null,
        content: content.trim(),
        links: links ? links.split(",").map(l => l.trim()) : [],
        createdAt: serverTimestamp(),
      });

      addToast({ type: "success", title: "Blog Created", message: "Your blog was posted" });

      // ✅ reset fields
      setTitle(""); setSubtitle(""); setContent(""); setLinks("");
    } catch (err) {
      console.error(err);
      addToast({ type: "error", title: "Error", message: "Could not save blog" });
    } finally {
      setIsSubmitting(false);
    }
  };

  // 🔹 Delete blog (admin only)
  const handleDelete = async (id) => {
    if (deletingId) return;
    const ok = window.confirm("Are you sure you want to delete this blog?");
    if (!ok) return;

    try {
      setDeletingId(id);
      await deleteDoc(doc(db, "blogs", id));
      addToast({ type: "success", title: "Deleted", message: "Blog was deleted successfully" });
    } catch (err) {
      console.error(err);
      addToast({ type: "error", title: "Error", message: "Could not delete blog" });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div style={{ fontFamily: 'Arial, Helvetica, sans-serif', padding: '2rem 3rem', maxWidth: '1000px', margin: '0 auto', backgroundColor: '#fff' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 'bold', color: '#2d89ef', textAlign: 'center', marginBottom: '2rem' }}>
        Health Blogs & Resources
      </h1>

      {/* Create Blog Button */}
      {user && profile?.role !== "citizen" && (
        <button
          onClick={() => setShowForm(!showForm)}
          style={{
            backgroundColor: '#2d89ef',
            color: '#fff',
            fontSize: '1rem',
            fontWeight: 'bold',
            border: 'none',
            borderRadius: '8px',
            padding: '0.7rem 1.5rem',
            cursor: 'pointer',
            marginBottom: '1.5rem',
            transition: '0.3s',
          }}
          onMouseOver={e => e.currentTarget.style.backgroundColor = '#1b5fbf'}
          onMouseOut={e => e.currentTarget.style.backgroundColor = '#2d89ef'}
        >
          {showForm ? 'Cancel' : 'Create Blog'}
        </button>
      )}

      {/* Blog Form Modal */}
      {showForm && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0,
          width: '100%', height: '100%',
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
          padding: '1rem'
        }}>
          <form onSubmit={handleSubmit} style={{
            backgroundColor: '#fff',
            padding: '1.5rem',
            borderRadius: '12px',
            width: '400px',
            maxWidth: '95%',
            boxShadow: '0 6px 20px rgba(0,0,0,0.1)',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <h2 style={{ color: '#2d89ef', marginBottom: '1rem' }}>Create New Blog</h2>

            <label>Category</label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              style={{
                padding: "0.7rem",
                marginBottom: "1rem",
                borderRadius: "6px",
                border: "1px solid #ddd"
              }}
            >
              {categories.filter(c => c !== 'All').map(c => <option key={c}>{c}</option>)}
            </select>

            <label>Title *</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
              placeholder="Enter blog title"
              style={{
                padding: "0.7rem",
                marginBottom: "1rem",
                borderRadius: "6px",
                border: "1px solid #ddd"
              }}
            />

            <label>Subtitle (optional)</label>
            <input
              type="text"
              value={subtitle}
              onChange={e => setSubtitle(e.target.value)}
              placeholder="Enter blog subtitle"
              style={{
                padding: "0.7rem",
                marginBottom: "1rem",
                borderRadius: "6px",
                border: "1px solid #ddd"
              }}
            />

            <label>Content *</label>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              rows="5"
              maxLength="2000"
              required
              placeholder="Write your blog content here..."
              style={{
                padding: "0.7rem",
                marginBottom: "0.5rem",
                borderRadius: "6px",
                border: "1px solid #ddd",
                resize: "none"
              }}
            />
            <p style={{ fontSize: '0.8rem', color: '#777', marginBottom: '1rem' }}>{content.length}/2000</p>

            <label>Links (comma separated, optional)</label>
            <input
              type="text"
              value={links}
              onChange={e => setLinks(e.target.value)}
              placeholder="https://example.com, https://another.com"
              style={{
                padding: "0.7rem",
                marginBottom: "1rem",
                borderRadius: "6px",
                border: "1px solid #ddd"
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  padding: '0.6rem 1rem',
                  borderRadius: '8px',
                  backgroundColor: isSubmitting ? '#999' : '#2d89ef',
                  color: '#fff',
                  fontWeight: 'bold',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer'
                }}
              >
                {isSubmitting ? "Submitting..." : "Submit"}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                style={{
                  padding: '0.6rem 1rem',
                  borderRadius: '8px',
                  backgroundColor: '#ccc',
                  color: '#000',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Category Filter */}
      <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '2rem' }}>
        {categories.map(cat => (
          <button key={cat} onClick={() => { setSelectedCategory(cat); setSearchTerm(""); }}
            style={{
              padding: '0.6rem 1.2rem',
              borderRadius: '10px',
              fontWeight: 'bold',
              fontSize: '0.95rem',
              cursor: 'pointer',
              color: selectedCategory === cat ? '#fff' : '#333',
              backgroundColor: selectedCategory === cat ? '#2d89ef' : '#f4f4f4',
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Search Bar */}
      <input
        type="text"
        placeholder="Search by title, category, tags, or content..."
        value={searchTerm}
        onChange={e => setSearchTerm(e.target.value)}
        style={{
          width: '100%',
          padding: '0.9rem',
          marginBottom: '1.5rem',
          borderRadius: '8px',
          border: '1px solid #ddd'
        }}
      />

      {/* Blog List */}
      {filteredBlogs.length > 0 ? (
        filteredBlogs.map((blog, index) => (
          <div key={blog.id} style={{
            padding: '1.5rem',
            borderRadius: '12px',
            boxShadow: '0 6px 18px rgba(0,0,0,0.08)',
            borderLeft: '6px solid #2d89ef',
            marginBottom: '1rem',
            transition: '0.2s'
          }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#2d89ef' }}>{blog.title}</h2>
            {blog.subtitle && <h3 style={{ fontSize: '1.1rem', color: '#555' }}>{blog.subtitle}</h3>}
            <p style={{ marginTop: '0.5rem', color: '#555' }}>{blog.content.length > 150 ? blog.content.slice(0, 150) + "..." : blog.content}</p>
            {expandedBlog === index && <p style={{ marginTop: '1rem', color: '#333' }}>{blog.content}</p>}
            {blog.links?.length > 0 && (
              <ul style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#2d89ef' }}>
                {blog.links.map((l, i) => <li key={i}><a href={l} target="_blank" rel="noopener noreferrer">{l}</a></li>)}
              </ul>
            )}
            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => setExpandedBlog(expandedBlog === index ? null : index)}
                style={{ padding: '0.6rem 1.2rem', background: '#2d89ef', color: '#fff', borderRadius: '8px', border: 'none', cursor: 'pointer' }}
              >
                {expandedBlog === index ? "Show Less" : "Read More"}
              </button>

              {/* 🔹 Delete button visible only to admin */}
              {profile?.role === "admin" && (
                <button
                  onClick={() => handleDelete(blog.id)}
                  disabled={deletingId === blog.id}
                  style={{
                    padding: '0.6rem 1.2rem',
                    background: deletingId === blog.id ? '#c0392b' : '#e74c3c',
                    color: '#fff',
                    borderRadius: '8px',
                    border: 'none',
                    cursor: deletingId === blog.id ? 'not-allowed' : 'pointer'
                  }}
                >
                  {deletingId === blog.id ? "Deleting..." : "Delete"}
                </button>
              )}
            </div>
          </div>
        ))
      ) : (
        <p style={{ color: '#777', textAlign: 'center' }}>No blogs found.</p>
      )}
    </div>
  );
}
