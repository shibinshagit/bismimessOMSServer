const Note = require('../../Models/noteModel');
const { Server } = require("socket.io");
let io;

// Function to set the io instance
const setSocketIOInstance = (ioInstance) => {
  io = ioInstance;
};

// GET all notes
const getAllNotes = async (req, res) => {
  try {
    const notes = await Note.find().sort({ date: 1 });
    res.json(notes);
  } catch (error) {
    console.error('Error fetching notes:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET single note by ID
const getNoteById = async (req, res) => {
  try {
    const { id } = req.params;
    const note = await Note.findById(id);
    if (!note) return res.status(404).json({ message: 'Note not found' });
    res.json(note);
  } catch (error) {
    console.error('Error fetching note by ID:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// POST add new note
const createNote = async (req, res) => {
  try {
    const { toWhom, matter, date, markAsRead } = req.body;

    // Validate required fields
    if (!toWhom || !matter || !date) {
      return res.status(400).json({ message: "Required fields missing" });
    }

    // Save the new note
    const newNote = new Note({ toWhom, matter, date, markAsRead });
    const savedNote = await newNote.save();

    // Emit a notification to all connected clients
    if (io) {
      io.emit("newNote", savedNote);
    }

    res.status(201).json(savedNote);
  } catch (error) {
    console.error("Error creating note:", error);
    res.status(500).json({ message: "Server error" });
  }
};



// PUT update note
const updateNote = async (req, res) => {
  try {
    const { id } = req.params;
    const { toWhom, matter, date, markAsRead } = req.body;
    const updatedNote = await Note.findByIdAndUpdate(
      id,
      { toWhom, matter, date, markAsRead },
      { new: true }
    );
    if (!updatedNote) return res.status(404).json({ message: 'Note not found' });
    res.json(updatedNote);
  } catch (error) {
    console.error('Error updating note:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// DELETE note
const deleteNote = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedNote = await Note.findByIdAndDelete(id);
    if (!deletedNote) return res.status(404).json({ message: 'Note not found' });
    res.json({ message: 'Note deleted successfully' });
  } catch (error) {
    console.error('Error deleting note:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
// getUnreadCount
// const Note = require('../../Models/noteModel');
const getUnreadCount = async (req, res) => {
  try {
    // Count notes where `read` is false
    const unreadCount = await Note.countDocuments({ markAsRead: false });
    console.log('count:',unreadCount)
    res.status(200).json({ count: unreadCount });
  } catch (error) {
    console.error("Error fetching unread notifications count:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}


module.exports = {
    getAllNotes,    
    getNoteById,
    createNote,
    updateNote,
    deleteNote,
    getUnreadCount,
    setSocketIOInstance 
};
