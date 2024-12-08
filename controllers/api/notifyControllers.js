const Note = require('../../Models/noteModel');

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
    if (!toWhom || !matter || !date) {
      return res.status(400).json({ message: 'Required fields missing' });
    }
    const newNote = new Note({ toWhom, matter, date, markAsRead });
    const savedNote = await newNote.save();
    res.status(201).json(savedNote);
  } catch (error) {
    console.error('Error creating note:', error);
    res.status(500).json({ message: 'Server error' });
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

module.exports = {
    getAllNotes,
    getNoteById,
    createNote,
    updateNote,
    deleteNote,
};
